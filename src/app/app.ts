import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { finalize } from 'rxjs';

interface Customer {
  id?: number;
  fullName: string | null;
  passportNo: string;
  dob: string | null;
  designation: string;
  ppType: string | null;
  mobileNo: string;
  address: string;
  remark: string | null;
  createdDate?: string | null;
  photo: string;
  cv: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, HttpClientModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class App {
  //private readonly baseUrl = 'http://localhost:8080/users';
  private readonly baseUrl = 'https://syconsultancy-backend.onrender.com/users';
  private readonly apiUrl = `${this.baseUrl}/getAllUsers`;
  private readonly userUrl = `${this.baseUrl}/getUser`;
  private readonly registerUrl = `${this.baseUrl}/register`;
  private readonly updateUrl = `${this.baseUrl}/updateUser`;
  private readonly deleteUrl = `${this.baseUrl}/deleteUser`;

  readonly users = signal<Customer[]>([]);
  readonly searchTerm = signal('');
  readonly statusMessage = signal('Welcome to SY Consultancy. Add a candidate and manage interview processing with confidence.');
  readonly editMode = signal(false);
  readonly viewMode = signal<'welcome' | 'form' | 'list' | 'details'>('welcome');
  readonly authState = signal<'logged-in' | 'logged-out'>(localStorage.getItem('syconsultancy-auth') === 'logged-in' ? 'logged-in' : 'logged-out');
  readonly selectedCustomer = signal<Customer | null>(null);
  readonly isLoading = signal(false);
  readonly toastMessage = signal('');
  readonly toastType = signal<'success' | 'error' | 'info' | ''>('');
  readonly photoPreview = signal('');
  readonly selectedPhotoName = signal('');
  readonly selectedCvName = signal('');

  private toastTimeout?: number;

  readonly filteredCustomers = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    return term
      ? this.users().filter((customer) =>
          (customer.fullName || '').toLowerCase().includes(term) ||
          customer.mobileNo.toLowerCase().includes(term) ||
          customer.passportNo.toLowerCase().includes(term)
        )
      : this.users();
  });

  readonly photoSrc = computed(() => {
    const photo = this.selectedCustomer()?.photo || '';
    if (!photo) {
      return '';
    }
    if (photo.startsWith('data:')) {
      return photo;
    }
    if (photo.startsWith('/9j/') || photo.startsWith('iVBOR') || photo.startsWith('R0lGOD')) {
      return `data:image/jpeg;base64,${photo}`;
    }
    return photo;
  });

  private isBase64String(value: string): boolean {
    const normalized = value.replace(/\s+/g, '');
    return normalized.length > 100 && /^[A-Za-z0-9+/=]+$/.test(normalized);
  }

  private getBase64MimeType(value: string): string {
    const normalized = value.replace(/\s+/g, '');
    if (/^JVBERi0/.test(normalized)) {
      return 'application/pdf';
    }
    if (/^\/9j\//.test(normalized)) {
      return 'image/jpeg';
    }
    if (/^iVBORw0KG/.test(normalized)) {
      return 'image/png';
    }
    if (/^R0lGOD/.test(normalized)) {
      return 'image/gif';
    }
    return 'application/pdf';
  }

  readonly cvHref = computed(() => {
    const cv = this.selectedCustomer()?.cv || '';
    if (!cv) {
      return '';
    }
    const trimmed = cv.trim();
    if (trimmed.startsWith('data:')) {
      return trimmed;
    }
    if (trimmed.startsWith('http') || trimmed.startsWith('/')) {
      return trimmed;
    }

    const normalized = trimmed.replace(/\s+/g, '');
    if (normalized.includes('base64,')) {
      if (normalized.startsWith('data:')) {
        return normalized;
      }
      const [prefix, base64Data] = normalized.split('base64,');
      if (base64Data) {
        if (prefix.includes('/')) {
          return `data:${prefix}base64,${base64Data}`;
        }
        return `data:application/pdf;base64,${base64Data}`;
      }
    }
    if (this.isBase64String(normalized)) {
      const mime = this.getBase64MimeType(normalized);
      return `data:${mime};base64,${normalized}`;
    }
    return '';
  });

  readonly cvLabel = computed(() => {
    const cv = this.selectedCustomer()?.cv || '';
    if (!cv) {
      return 'No CV available';
    }
    if (cv.startsWith('data:') || cv.startsWith('http') || cv.startsWith('/') || this.isBase64String(cv)) {
      return 'Download CV';
    }
    return 'CV unavailable';
  });

  readonly cvDownloadName = computed(() => {
    const customer = this.selectedCustomer();
    if (!customer) {
      return 'candidate_cv.pdf';
    }
    const baseName = (customer.fullName || 'candidate').trim().replace(/\s+/g, '_').toLowerCase() || 'candidate';
    const href = this.cvHref();
    if (href.includes('application/pdf')) {
      return `${baseName}.pdf`;
    }
    if (href.includes('application/msword')) {
      return `${baseName}.doc`;
    }
    if (href.includes('vnd.openxmlformats-officedocument.wordprocessingml.document')) {
      return `${baseName}.docx`;
    }
    return `${baseName}.pdf`;
  });

  readonly loginForm: FormGroup;
  readonly customerForm: FormGroup;

  private photoFile?: File;
  private cvFile?: File;

  constructor(private fb: FormBuilder, private http: HttpClient) {    this.loginForm = this.fb.group({
      username: ['', Validators.required],
      password: ['', Validators.required]
    });
    this.customerForm = this.fb.group({
      id: [null as number | null],
      fullName: ['', Validators.required],
      dob: ['', Validators.required],
      mobileNo: ['', [Validators.required, Validators.pattern(/^[0-9+\\-\\s]+$/)]],
      passportNo: ['', Validators.required],
      ppType: ['Regular', Validators.required],
      designation: ['', Validators.required],
      address: ['', Validators.required],
      remark: ['']
    });
  }

  fetchCustomers(): void {
    this.isLoading.set(true);
    this.setStatus('Loading customer list...');
    this.http.get<Customer[]>(this.apiUrl).pipe(finalize(() => this.isLoading.set(false))).subscribe({
      next: (customers) => {
        this.users.set(customers);
      },
      error: () => {
        this.setStatus(`Unable to load customers. Check Spring Boot backend at ${this.baseUrl}.`);
        this.showToast('Unable to load customer list.', 'error');
      }
    });
  }

  onSearchChange(value: string): void {
    this.searchTerm.set(value);
  }

  showWelcome(): void {
    if (this.authState() === 'logged-out') {
      return;
    }
    this.viewMode.set('welcome');
  }

  showForm(): void {
    this.resetForm();
    this.viewMode.set('form');
  }

  showList(): void {
    this.fetchCustomers();
    this.viewMode.set('list');
  }

  viewCustomer(customer: Customer): void {
    if (this.authState() === 'logged-out') {
      this.showToast('Please login before viewing candidate details.', 'error');
      return;
    }
    if (!customer.id) {
      this.showToast('Unable to load customer details.', 'error');
      return;
    }

    this.isLoading.set(true);
    this.http.get<Customer>(`${this.userUrl}/${customer.id}`).pipe(finalize(() => this.isLoading.set(false))).subscribe({
      next: (customerDetails) => {
        this.selectedCustomer.set(customerDetails);
        this.editMode.set(false);
        this.viewMode.set('details');
        this.photoPreview.set(customerDetails.photo || '');
        this.selectedPhotoName.set('');
        this.selectedCvName.set('');
        this.setStatus(`Viewing details for ${customerDetails.fullName || 'candidate'}.`);
      },
      error: () => {
        this.showToast('Unable to load customer details.', 'error');
        this.setStatus('Unable to load customer details.');
      }
    });
  }

  enableDetailEdit(): void {
    const customer = this.selectedCustomer();
    if (!customer) {
      this.showToast('No customer selected to edit.', 'error');
      return;
    }

    this.customerForm.reset({
      id: customer.id ?? null,
      fullName: customer.fullName,
      dob: customer.dob,
      mobileNo: customer.mobileNo,
      passportNo: customer.passportNo,
      ppType: customer.ppType,
      designation: customer.designation,
      address: customer.address,
      remark: customer.remark
    });

    this.editMode.set(true);
    this.photoPreview.set(customer.photo || '');
    this.selectedPhotoName.set('');
    this.selectedCvName.set('');
    this.photoFile = undefined;
    this.cvFile = undefined;
    this.setStatus(`Editing record for ${customer.fullName || 'Unknown'}.`);
  }

  cancelDetailEdit(): void {
    this.editMode.set(false);
    this.resetForm();
    this.setStatus('Canceled changes. Viewing candidate details.');
  }

  showToast(message: string, type: 'success' | 'error' | 'info' = 'success'): void {
    this.toastMessage.set(message);
    this.toastType.set(type);
    if (this.toastTimeout) {
      window.clearTimeout(this.toastTimeout);
    }
    this.toastTimeout = window.setTimeout(() => {
      this.toastMessage.set('');
      this.toastType.set('');
    }, 4200);
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0);
    if (!file) {
      return;
    }
    this.photoFile = file;
    this.selectedPhotoName.set(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      this.photoPreview.set(reader.result as string || '');
    };
    reader.readAsDataURL(file);
  }

  onCvSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0);
    if (!file) {
      return;
    }
    this.cvFile = file;
    this.selectedCvName.set(file.name);
  }

  login(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      this.showToast('Please enter username and password.', 'error');
      return;
    }

    const { username, password } = this.loginForm.value as { username: string; password: string };
    if (username === 'syconsultancy' && password === 'syconsultancy') {
      localStorage.setItem('syconsultancy-auth', 'logged-in');
      this.authState.set('logged-in');
      this.setStatus('Logged in successfully. Welcome to SY Consultancy.');
      this.showToast('Login successful.', 'success');
      this.viewMode.set('welcome');
      return;
    }

    this.showToast('Invalid username or password.', 'error');
    this.setStatus('Login failed. Please try again.');
  }

  logout(): void {
    localStorage.removeItem('syconsultancy-auth');
    this.authState.set('logged-out');
    this.setStatus('You have been logged out. Please sign in again to continue.');
    this.showToast('Logged out successfully.', 'success');
    this.loginForm.reset();
    this.viewMode.set('welcome');
  }

  saveCustomer(): void {
    console.log('saveCustomer called');
    if (this.authState() === 'logged-out') {
      this.showToast('Please login before saving customer details.', 'error');
      return;
    }
    if (this.customerForm.invalid) {
      console.log('Form is invalid');
      console.log('Form errors:', this.customerForm.errors);
      Object.keys(this.customerForm.controls).forEach(key => {
        const control = this.customerForm.get(key);
        if (control && control.invalid) {
          console.log(`${key} errors:`, control.errors);
        }
      });
      this.setStatus('Please complete all required fields before saving.');
      this.customerForm.markAllAsTouched();
      return;
    }

    console.log('Form is valid');
    const formValue = this.customerForm.value as Omit<Customer, 'photo' | 'cv'> & { id: number | null };
    console.log('saveCustomer triggered', { editMode: this.editMode(), formValue, registerUrl: this.registerUrl, updateUrl: this.updateUrl });
    this.setStatus('Submitting customer data to backend...');

    const formData = new FormData();
   

    formData.append('fullName', formValue.fullName || '');
    formData.append('passportNo', formValue.passportNo);
    formData.append('dob', formValue.dob || '');
    formData.append('designation', formValue.designation);
    formData.append('ppType', formValue.ppType || '');
    formData.append('mobileNo', formValue.mobileNo);
    formData.append('address', formValue.address);
    formData.append('remark', formValue.remark || '');
    

    if (this.photoFile) {
      formData.append('photoFile', this.photoFile);
    }
    if (this.cvFile) {
      formData.append('cvFile', this.cvFile);
    }

    if (this.editMode() && formValue.id) {
      formData.append('id', formValue.id.toString());
    }

    const request = this.editMode() && formValue.id
      ? this.http.put<Customer>(this.updateUrl, formData)
      : this.http.post<Customer>(this.registerUrl, formData);

    this.isLoading.set(true);
    request.pipe(finalize(() => this.isLoading.set(false))).subscribe({
      next: (savedCustomer: Customer) => {
        const action = this.editMode() ? 'updated' : 'added';
        this.showToast(`Candidate ${action} successfully!`, 'success');
        this.setStatus(`Candidate ${action} successfully.`);

        if (this.viewMode() === 'details' && this.editMode()) {
          this.selectedCustomer.set(savedCustomer);
          this.editMode.set(false);
          this.viewMode.set('details');
        } else {
          this.resetForm();
          this.showList();
        }

        this.fetchCustomers();
      },
      error: (error) => {
        const message = error?.message || 'Unable to save candidate. Please try again.';
        this.showToast(message, 'error');
        this.setStatus(message);
      }
    });
  }

  editCustomer(customer: Customer): void {
    this.customerForm.reset({
      id: customer.id ?? null,
      fullName: customer.fullName,
      dob: customer.dob,
      mobileNo: customer.mobileNo,
      passportNo: customer.passportNo,
      ppType: customer.ppType,
      designation: customer.designation,
      address: customer.address,
      remark: customer.remark
    });
    this.editMode.set(true);
    this.photoPreview.set(customer.photo || '');
    this.selectedPhotoName.set('');
    this.selectedCvName.set('');
    this.photoFile = undefined;
    this.cvFile = undefined;
    this.setStatus(`Editing record for ${customer.fullName || 'Unknown'}.`);
  }

  deleteCustomer(customer: Customer): void {
    const id = customer.id;
    if (!id) {
      this.setStatus('Cannot delete a customer without an ID.');
      return;
    }

    if (!confirm(`Delete candidate ${customer.fullName || 'this record'}? This action cannot be undone.`)) {
      return;
    }

    this.isLoading.set(true);
    this.http.delete(`${this.deleteUrl}/${id}`, { responseType: 'text' }).pipe(finalize(() => this.isLoading.set(false))).subscribe({
      next: () => {
        this.showToast(`Candidate deleted successfully.`, 'success');
        this.setStatus(`Candidate ${customer.fullName || 'record'} deleted successfully.`);
        this.fetchCustomers();
      },
      error: () => {
        this.showToast('Unable to delete candidate. Please try again.', 'error');
        this.setStatus('Unable to delete candidate. Please try again.');
      }
    });
  }

  resetForm(): void {
    this.customerForm.reset({
      id: null,
      fullName: '',
      dob: '',
      mobileNo: '',
      passportNo: '',
      ppType: 'Regular',
      designation: '',
      address: '',
      remark: ''
    });
    this.editMode.set(false);
    this.photoPreview.set('');
    this.selectedPhotoName.set('');
    this.selectedCvName.set('');
    this.photoFile = undefined;
    this.cvFile = undefined;
  }

  private setStatus(message: string): void {
    this.statusMessage.set(message);
  }
}
