import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';

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
  private readonly baseUrl = 'http://localhost:8080/users';
  private readonly apiUrl = `${this.baseUrl}/getAllUsers`;
  private readonly registerUrl = `${this.baseUrl}/register`;
  private readonly updateUrl = `${this.baseUrl}/updateUser`;

  readonly users = signal<Customer[]>([]);
  readonly searchTerm = signal('');
  readonly statusMessage = signal('Welcome to SY Consultancy. Add a candidate and manage interview processing with confidence.');
  readonly editMode = signal(false);
  readonly photoPreview = signal('');
  readonly selectedPhotoName = signal('');
  readonly selectedCvName = signal('');

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

  readonly customerForm: FormGroup;

  private photoFile?: File;
  private cvFile?: File;

  constructor(private fb: FormBuilder, private http: HttpClient) {
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
    this.fetchCustomers();
  }

  fetchCustomers(): void {
    this.http.get<Customer[]>(this.apiUrl).subscribe({
      next: (customers) => {
        this.users.set(customers);
      },
      error: () => {
        this.setStatus(`Unable to load customers. Check Spring Boot backend at ${this.baseUrl}.`);
      }
    });
  }

  onSearchChange(value: string): void {
    this.searchTerm.set(value);
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

  saveCustomer(): void {
    console.log('saveCustomer called');
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
    const createdDate = new Date().toISOString();

    formData.append('fullName', formValue.fullName || '');
    formData.append('passportNo', formValue.passportNo);
    formData.append('dob', formValue.dob || '');
    formData.append('designation', formValue.designation);
    formData.append('ppType', formValue.ppType || '');
    formData.append('mobileNo', formValue.mobileNo);
    formData.append('address', formValue.address);
    formData.append('remark', formValue.remark || '');
    formData.append('createdDate', createdDate);

    if (this.photoFile) {
      formData.append('photo', this.photoFile);
    }
    if (this.cvFile) {
      formData.append('cv', this.cvFile);
    }

    if (this.editMode() && formValue.id) {
      formData.append('id', formValue.id.toString());
    }

    const request = this.editMode() && formValue.id
      ? this.http.put<Customer>(this.updateUrl, formData)
      : this.http.post<Customer>(this.registerUrl, formData);

    request.subscribe({
      next: () => {
        const action = this.editMode() ? 'updated' : 'saved';
        if (this.editMode()) {
          alert('Customer details updated successfully');
        } else {
          alert('Customer details added successfully');
        }
        this.setStatus(`Candidate ${action} successfully.`);
        this.resetForm();
        this.fetchCustomers();
      },
      error: (error) => {
        const message = error?.message || 'Unable to save candidate. Please try again.';
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
