# Servv Inventory Management - Quick Reference Guide

## Common Operations

### 1. Check Stock Levels

**API Call:**
```bash
GET /api/inventory
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": "item_abc123",
    "name": "Chicken Breast",
    "category": "Meat",
    "unitOfMeasure": "kg",
    "totalStock": 45.5,
    "totalValue": 136500,
    "stockByLocation": [
      {
        "locationId": "loc_kitchen",
        "locationName": "Kitchen",
        "quantity": 15.5,
        "minLevel": 10,
        "reorderPoint": 20
      },
      {
        "locationId": "loc_cold_room",
        "locationName": "Cold Room",
        "quantity": 30,
        "minLevel": 20,
        "reorderPoint": 40
      }
    ],
    "activeAlerts": [
      {
        "type": "low_stock",
        "message": "Chicken Breast is low on stock in Kitchen",
        "severity": "high"
      }
    ]
  }
]
```

---

### 2. Adjust Stock

**API Call:**
```bash
POST /api/inventory/item_abc123/adjust
Authorization: Bearer <token>
Content-Type: application/json

{
  "locationId": "loc_kitchen",
  "adjustment": -5,
  "reason": "Spoiled - disposed",
  "performedBy": "user_manager1"
}
```

**Response:**
```json
{
  "locationId": "loc_kitchen",
  "locationName": "Kitchen",
  "quantity": 10.5,
  "reservedQty": 0,
  "minLevel": 10,
  "maxLevel": 50,
  "reorderPoint": 20,
  "reorderQty": 30,
  "safetyStock": 5
}
```

---

### 3. Create a Location

**API Call:**
```bash
POST /api/locations
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Bar Fridge",
  "type": "bar",
  "description": "Main bar refrigeration unit",
  "capacity": 100,
  "temperatureRange": "2-4°C"
}
```

**Response:**
```json
{
  "id": "loc_bar_fridge_123",
  "restaurantId": "rest_abc",
  "name": "Bar Fridge",
  "type": "bar",
  "description": "Main bar refrigeration unit",
  "isActive": true,
  "capacity": 100,
  "temperatureRange": "2-4°C",
  "totalItems": 0,
  "totalStock": 0,
  "lowStockItems": 0,
  "createdAt": "2026-03-27T12:00:00Z",
  "updatedAt": "2026-03-27T12:00:00Z"
}
```

---

### 4. Add Recipe Ingredient

**API Call:**
```bash
POST /api/recipes/menu_burger_123
Authorization: Bearer <token>
Content-Type: application/json

{
  "inventoryItemId": "item_chicken_abc",
  "quantity": 0.2,
  "unitOfMeasure": "kg",
  "yieldPercentage": 85,
  "isOptional": false
}
```

**Response:**
```json
{
  "id": "recipe_xyz789",
  "restaurantId": "rest_abc",
  "menuItemId": "menu_burger_123",
  "inventoryItemId": "item_chicken_abc",
  "inventoryItemName": "Chicken Breast",
  "quantity": 0.2,
  "unitOfMeasure": "kg",
  "yieldPercentage": 85,
  "isOptional": false,
  "createdAt": "2026-03-27T12:00:00Z",
  "updatedAt": "2026-03-27T12:00:00Z"
}
```

---

### 5. Check Stock Requirements for Menu Item

**API Call:**
```bash
GET /api/recipes/menu_burger_123/requirements?quantity=10
Authorization: Bearer <token>
```

**Response:**
```json
{
  "menuItemId": "menu_burger_123",
  "menuItemName": "Chicken Burger",
  "ingredients": [
    {
      "inventoryItemId": "item_chicken_abc",
      "inventoryItemName": "Chicken Breast",
      "quantityNeeded": 2.0,
      "quantityAvailable": 45.5,
      "unitOfMeasure": "kg",
      "canFulfill": true
    },
    {
      "inventoryItemId": "item_bun_xyz",
      "inventoryItemName": "Burger Bun",
      "quantityNeeded": 10,
      "quantityAvailable": 50,
      "unitOfMeasure": "unit",
      "canFulfill": true
    }
  ],
  "canFulfillAll": true,
  "maxServings": 227
}
```

---

### 6. Create Purchase Order

**API Call:**
```bash
POST /api/purchase-orders
Authorization: Bearer <token>
Content-Type: application/json

{
  "supplierId": "sup_meat_supplier",
  "supplierName": "Quality Meats Ltd",
  "items": [
    {
      "inventoryItemId": "item_chicken_abc",
      "inventoryItemName": "Chicken Breast",
      "orderedQty": 50,
      "unitCost": 3000,
      "totalCost": 150000
    }
  ],
  "expectedDelivery": "2026-03-30",
  "notes": "Weekly meat order",
  "createdBy": "user_manager1"
}
```

**Response:**
```json
{
  "id": "po_abc123",
  "supplierId": "sup_meat_supplier",
  "supplierName": "Quality Meats Ltd",
  "status": "draft",
  "items": [
    {
      "inventoryItemId": "item_chicken_abc",
      "inventoryItemName": "Chicken Breast",
      "orderedQty": 50,
      "receivedQty": 0,
      "unitCost": 3000,
      "totalCost": 150000
    }
  ],
  "totalCost": 150000,
  "expectedDelivery": "2026-03-30",
  "createdBy": "user_manager1",
  "createdAt": "2026-03-27T12:00:00Z",
  "updatedAt": "2026-03-27T12:00:00Z"
}
```

---

### 7. Receive Purchase Order (with Lot Creation)

**API Call:**
```bash
POST /api/purchase-orders/po_abc123/receive
Authorization: Bearer <token>
Content-Type: application/json

{
  "receivedItems": [
    {
      "inventoryItemId": "item_chicken_abc",
      "receivedQty": 50,
      "lotNumber": "LOT-2026-03-27-001",
      "expiryDate": "2026-04-10",
      "locationId": "loc_cold_room"
    }
  ],
  "receivedBy": "user_staff1"
}
```

**Response:**
```json
{
  "id": "po_abc123",
  "status": "received",
  "receivedAt": "2026-03-27T12:00:00Z",
  "items": [
    {
      "inventoryItemId": "item_chicken_abc",
      "inventoryItemName": "Chicken Breast",
      "orderedQty": 50,
      "receivedQty": 50,
      "unitCost": 3000,
      "totalCost": 150000
    }
  ]
}
```

---

### 8. Record Waste

**API Call:**
```bash
POST /api/waste
Authorization: Bearer <token>
Content-Type: application/json

{
  "inventoryItemId": "item_chicken_abc",
  "inventoryItemName": "Chicken Breast",
  "locationId": "loc_kitchen",
  "quantity": 2.5,
  "unitCost": 3000,
  "reason": "expired",
  "reportedBy": "user_staff1",
  "recordedBy": "user_manager1",
  "notes": "Expired - disposed per health guidelines"
}
```

**Response:**
```json
{
  "id": "waste_xyz789",
  "inventoryItemId": "item_chicken_abc",
  "inventoryItemName": "Chicken Breast",
  "locationId": "loc_kitchen",
  "quantity": 2.5,
  "unitCost": 3000,
  "totalCost": 7500,
  "reason": "expired",
  "reportedBy": "user_staff1",
  "recordedBy": "user_manager1",
  "notes": "Expired - disposed per health guidelines",
  "timestamp": "2026-03-27T12:00:00Z"
}
```

---

### 9. Create Cycle Count

**API Call:**
```bash
POST /api/cycle-counts
Authorization: Bearer <token>
Content-Type: application/json

{
  "locationId": "loc_kitchen",
  "scheduledDate": "2026-03-28",
  "countedBy": "user_staff1"
}
```

**Response:**
```json
{
  "id": "cc_abc123",
  "restaurantId": "rest_abc",
  "locationId": "loc_kitchen",
  "locationName": "Kitchen",
  "status": "pending",
  "scheduledDate": "2026-03-28",
  "countedBy": "user_staff1",
  "totalItems": 25,
  "countedItems": 0,
  "varianceItems": 0,
  "totalVarianceValue": 0,
  "items": [],
  "createdAt": "2026-03-27T12:00:00Z",
  "updatedAt": "2026-03-27T12:00:00Z"
}
```

---

### 10. Get Low Stock Alerts

**API Call:**
```bash
GET /api/alerts?isResolved=false&alertType=low_stock
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": "alert_abc123",
    "restaurantId": "rest_abc",
    "alertType": "low_stock",
    "inventoryItemId": "item_chicken_abc",
    "inventoryItemName": "Chicken Breast",
    "locationId": "loc_kitchen",
    "locationName": "Kitchen",
    "thresholdValue": 10,
    "currentValue": 8,
    "isResolved": false,
    "message": "Chicken Breast is low on stock in Kitchen (8 <= 10)",
    "severity": "high",
    "createdAt": "2026-03-27T12:00:00Z"
  }
]
```

---

## Common Queries

### Get all items below reorder point
```bash
GET /api/inventory?belowReorderPoint=true
```

### Get stock at specific location
```bash
GET /api/locations/loc_kitchen/stock
```

### Get expiring lots (next 7 days)
```bash
GET /api/lots/expiring?days=7
```

### Get waste summary for last 30 days
```bash
GET /api/waste/summary/overview
```

### Get movement history for item
```bash
GET /api/inventory/item_abc123/movements?fromDate=2026-03-01&toDate=2026-03-27
```

---

## Error Handling

### Common Error Responses

**404 Not Found:**
```json
{
  "error": "Inventory item not found"
}
```

**400 Bad Request:**
```json
{
  "error": "Cannot delete location with stock. Transfer stock first."
}
```

**409 Conflict:**
```json
{
  "error": "Stock record already exists for this item and location"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Failed to update inventory"
}
```

---

## Best Practices

### 1. Always Specify Location
When adjusting stock, always specify the location ID to ensure accurate tracking.

### 2. Use Transactions
For operations that affect multiple records (like receiving POs), use database transactions to ensure data consistency.

### 3. Record Reason for Adjustments
Always provide a reason when adjusting stock to maintain a clear audit trail.

### 4. Monitor Alerts Regularly
Check alerts daily to address low stock and expiring items promptly.

### 5. Perform Regular Cycle Counts
Schedule cycle counts at least monthly to ensure physical stock matches system records.

### 6. Set Appropriate Thresholds
Configure min/max levels and reorder points based on actual usage patterns and lead times.

### 7. Use Lot Tracking for Perishables
Always create lots with expiry dates for perishable items to enable FIFO/FEFO management.

### 8. Review Waste Reports
Analyze waste reports weekly to identify patterns and reduce waste.

---

## Troubleshooting

### Issue: Stock not updating after order
**Solution:** Check that recipe ingredients are properly linked to menu items.

### Issue: Alerts not triggering
**Solution:** Verify that min_level and reorder_point are set correctly in inventory_stock.

### Issue: Cannot delete location
**Solution:** Transfer all stock from the location before deleting.

### Issue: Lot expiry not tracking
**Solution:** Ensure expiry_date is set when creating lots.

### Issue: Cycle count variance too high
**Solution:** Review recent movements and check for unrecorded waste or theft.

---

## Support

For additional help:
- Review full documentation in `INVENTORY_MANAGEMENT_IMPROVEMENT_PLAN.md`
- Check implementation details in `INVENTORY_IMPLEMENTATION_GUIDE.md`
- View architecture diagrams in `INVENTORY_ARCHITECTURE.md`
