export interface ServiceReview {
  id: string;
  orderId: string;
  tableNumber: number;
  waiterId: string;
  rating: number; // 1-5
  comment?: string;
  createdAt: string; // ISO
}

