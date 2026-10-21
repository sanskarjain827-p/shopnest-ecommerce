# ShopNest – E-Commerce Web App

A full-stack online store built for the Thiranex Full Stack Development internship (Task 3).

**Stack:** Node.js, Express, MongoDB (Mongoose), JWT, vanilla HTML/CSS/JS

## Features
- Product catalogue with search and category filter
- Cart (saved in the browser) and checkout with shipping address
- Server-side order validation: prices come from the database and stock is checked and decremented
- Login with role-based access: **User** (shop, order history) and **Admin** (product CRUD, all orders, order status)
- Demo catalogue seeded automatically on first run
- Responsive layout

## Roles
The account registered with the email in `ADMIN_EMAIL` becomes the admin. Everyone else is a regular user.

## API
| Method | Route | Access |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` | Public |
| GET | `/api/products`, `/api/products/:id` | Public |
| POST / PUT / DELETE | `/api/products[/:id]` | Admin |
| POST | `/api/orders` | User |
| GET | `/api/orders/mine` | User |
| GET | `/api/orders` | Admin |
| PUT | `/api/orders/:id/status` | Admin |

## Run locally
```bash
npm install
cp .env.example .env   # MongoDB URI, JWT secret, admin email
npm start              # http://localhost:3000
```
