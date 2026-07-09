export interface Medicine {
  id: string;
  name: string;
  barcode?: string;
  gtin?: string;
  batchInfo?: string;
  expiryDates: string[];
}

export interface Project {
  id: string;
  name: string;
  medicines: Medicine[];
  createdAt: number;
}

export interface ReferenceMedicine {
  id: string;
  name: string;
  batchNumber: string;
  expiryDate?: string;
}
