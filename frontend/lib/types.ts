/** Sản phẩm trả về từ GET /products và GET /products/:id (backend Task 2.2). */
export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  category: string;
}
