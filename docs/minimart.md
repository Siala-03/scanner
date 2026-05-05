# Minimart Guide

Log in at `https://your-app.vercel.app/minimart` with your manager or cashier credentials.

---

## Cashier — POS Terminal

The main screen is a split-layout POS:

**Left panel — product search and catalog**
- Search bar: type product name or scan barcode
- Category tabs to filter
- Click a product to add to the cart

**Right panel — cart**
- Running list of items with quantities
- Adjust quantity with + / − buttons or click × to remove
- Cart total updates in real time
- **Charge** button opens the payment screen

### Payment Flow

1. Click **Charge**
2. Select payment method: Cash / Card / Mobile Money
3. For cash: enter amount received → change is calculated automatically
4. Click **Confirm Payment**
5. Receipt prints (or download as PDF)

---

## Manager — Dashboard

Overview panel showing:
- Today's revenue and transaction count
- Top-selling products
- Low-stock alerts

---

## Products

**Products tab**

- Add, edit, delete products
- Set name, price, barcode, category, description, image
- Enable/disable products without deleting
- Stock quantity shown per product

---

## Categories

**Categories tab**

- Add and rename product categories
- Categories appear as filter tabs in the cashier POS view

---

## Sales History

**Sales tab**

- All completed transactions
- Filter by date range
- Expand each sale to see items, quantities, unit prices
- Payment method shown per transaction

---

## Inventory

**Inventory tab**

- Current stock levels
- Manual stock adjustments (add / subtract with reason)
- Low-stock threshold alerts
- Stock movement log

---

## Staff (Cashiers)

**Staff tab**

- Add cashier accounts (name, username, password)
- Enable / disable accounts
- View sales per cashier

---

## EBM / Fiscal

**Fiscal (EBM) tab**

- Same OSDC/VSDC configuration as the restaurant portal
- See the [EBM Guide](./ebm.md) for setup

---

## Settings

**Settings tab**

- Outlet name, address, phone
- Currency
- Receipt footer text
- Logo upload
