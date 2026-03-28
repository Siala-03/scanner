# Servv Inventory Management - Improvement Plan

## Executive Summary

This document outlines a comprehensive improvement plan for the Servv inventory management system. The current system has a solid foundation but needs better integration between basic and enterprise features, improved location-based tracking, and enhanced automation capabilities.

---

## Current State Analysis

### Existing Strengths
- ✅ Basic inventory tracking with stock levels
- ✅ Supplier management
- ✅ Purchase order workflow
- ✅ Stock movement audit trail
- ✅ Waste tracking
- ✅ Enterprise tables for locations, lots, recipes (migration 015)
- ✅ Real-time updates via WebSocket
- ✅ Inventory forecasting

### Identified Issues

#### 1. **Dual Inventory Systems (Critical)**
- **Problem**: Two parallel systems exist:
  - `inventory_records` - Basic, linked to menu items
  - `inventory_items` - Enterprise, separate from menu items
- **Impact**: Confusion, data duplication, incomplete features
- **Evidence**: Migration 015 adds enterprise tables but routes still use basic system

#### 2. **Incomplete Location Support**
- **Problem**: `inventory_locations` table exists but not integrated
- **Impact**: Cannot track stock per location (bar, kitchen, warehouse)
- **Evidence**: `inventory_records.location` is text field, not FK to locations table

#### 3. **Recipe/Ingredient Linking Not Used**
- **Problem**: `recipe_ingredients` table exists but stock deduction doesn't use it
- **Impact**: Manual stock management, no automatic deduction on orders
- **Evidence**: `decrementStockForOrderLines` uses menu_item_id directly

#### 4. **Lot/Batch Tracking Unused**
- **Problem**: `inventory_lots` table exists but not integrated
- **Impact**: No FIFO/FEFO management, no expiry tracking
- **Evidence**: No routes or services for lot management

#### 5. **No Cycle Count Support**
- **Problem**: `cycle_counts` and `cycle_count_items` tables exist but no routes
- **Impact**: No scheduled inventory counting capability
- **Evidence**: Tables exist in migration 015, no API endpoints

#### 6. **Limited Analytics Caching**
- **Problem**: Analytics computed on-the-fly
- **Impact**: Slow performance for large inventories
- **Evidence**: `inventory_reports` table exists but unused

#### 7. **Missing Alert System**
- **Problem**: `inventory_alerts` table exists but not used
- **Impact**: No persistent alert management
- **Evidence**: Alerts only via WebSocket, not stored

---

## Proposed Architecture

### Core Principles
1. **Unified Inventory Model**: Single source of truth for all inventory
2. **Location-Aware**: All stock tracked per location
3. **Recipe-Driven**: Automatic stock deduction based on recipes
4. **Lot-Tracked**: Full traceability with FIFO/FEFO
5. **Alert-Driven**: Proactive notifications and actions

### Database Schema Improvements

#### Phase 1: Unify Inventory System
```sql
-- Migrate inventory_records to use inventory_items as primary
-- Link menu items to inventory items via recipe_ingredients
-- Deprecate direct menu_item_id in inventory_records

-- New unified view
CREATE VIEW inventory_unified AS
SELECT 
  ii.id as inventory_item_id,
  ii.name,
  ii.category,
  ii.unit_of_measure,
  ir.menu_item_id,
  ir.stock,
  ir.low_stock_threshold,
  ir.reorder_point,
  ir.reorder_qty,
  ir.unit_cost,
  ir.location_id,
  il.name as location_name
FROM inventory_items ii
LEFT JOIN inventory_records ir ON ir.inventory_item_id = ii.id
LEFT JOIN inventory_locations il ON ir.location_id = il.id;
```

#### Phase 2: Enable Location Tracking
```sql
-- Add location_id to all inventory operations
-- Update stock_movements to include from_location_id and to_location_id
-- Create location-specific stock views
```

#### Phase 3: Enable Recipe-Based Deduction
```sql
-- Link menu items to inventory items via recipe_ingredients
-- Automatic stock deduction when orders are placed
-- Support for yield percentages and waste factors
```

---

## Implementation Roadmap

### Sprint 1: Foundation (Week 1-2)
**Goal**: Unify inventory system and enable location tracking

#### Backend Tasks
1. **Create unified inventory service**
   - File: `backend/src/services/unifiedInventoryService.ts`
   - Merge basic and enterprise inventory logic
   - Location-aware stock operations

2. **Update inventory routes**
   - File: `backend/src/routes/inventory.ts`
   - Add location_id parameter to all endpoints
   - Support multi-location queries

3. **Create location management routes**
   - File: `backend/src/routes/locations.ts`
   - CRUD operations for inventory locations
   - Stock summary per location

4. **Database migration**
   - File: `backend/migrations/016_unify_inventory.sql`
   - Add inventory_item_id to inventory_records
   - Create indexes for performance

#### Frontend Tasks
1. **Update inventory types**
   - File: `src/types/inventory.ts`
   - Add location-aware types
   - Unified inventory item interface

2. **Update inventory API**
   - File: `src/api/inventory.ts`
   - Add location parameters
   - Support multi-location queries

3. **Update inventory hook**
   - File: `src/hooks/useInventory.ts`
   - Location-aware data fetching
   - Filter by location

### Sprint 2: Recipe Integration (Week 3-4)
**Goal**: Enable automatic stock deduction based on recipes

#### Backend Tasks
1. **Create recipe service**
   - File: `backend/src/services/recipeService.ts`
   - Manage recipe ingredients
   - Calculate stock requirements

2. **Update order service**
   - File: `backend/src/services/orderService.ts`
   - Integrate recipe-based deduction
   - Handle partial availability

3. **Create recipe routes**
   - File: `backend/src/routes/recipes.ts`
   - CRUD for recipe ingredients
   - Stock requirement calculations

#### Frontend Tasks
1. **Create recipe management UI**
   - File: `src/components/manager/RecipeEditor.tsx`
   - Link menu items to inventory items
   - Set quantities and yield percentages

2. **Update menu management**
   - File: `src/pages/manager/MenuManagement.tsx`
   - Add recipe tab
   - Show stock requirements

### Sprint 3: Lot Tracking (Week 5-6)
**Goal**: Enable FIFO/FEFO inventory management

#### Backend Tasks
1. **Create lot management service**
   - File: `backend/src/services/lotService.ts`
   - Lot creation and tracking
   - FIFO/FEFO selection logic

2. **Update purchase order receiving**
   - File: `backend/src/routes/purchaseOrders.ts`
   - Create lots on receipt
   - Track expiry dates

3. **Create lot routes**
   - File: `backend/src/routes/lots.ts`
   - Lot CRUD operations
   - Expiry alerts

#### Frontend Tasks
1. **Create lot management UI**
   - File: `src/components/manager/LotTracker.tsx`
   - View lots by item
   - Expiry date management

2. **Update purchase order UI**
   - File: `src/pages/shared/InventoryManagement.tsx`
   - Lot creation on receipt
   - Expiry date input

### Sprint 4: Cycle Counts & Alerts (Week 7-8)
**Goal**: Enable scheduled counting and proactive alerts

#### Backend Tasks
1. **Create cycle count service**
   - File: `backend/src/services/cycleCountService.ts`
   - Schedule and manage counts
   - Variance calculations

2. **Create cycle count routes**
   - File: `backend/src/routes/cycleCounts.ts`
   - Count CRUD operations
   - Variance reporting

3. **Create alert service**
   - File: `backend/src/services/alertService.ts`
   - Alert generation and management
   - Notification dispatch

4. **Create alert routes**
   - File: `backend/src/routes/alerts.ts`
   - Alert management
   - Alert configuration

#### Frontend Tasks
1. **Create cycle count UI**
   - File: `src/components/manager/CycleCountManager.tsx`
   - Schedule counts
   - Record counts and variances

2. **Create alert management UI**
   - File: `src/components/manager/AlertManager.tsx`
   - View and manage alerts
   - Configure alert thresholds

### Sprint 5: Analytics & Reporting (Week 9-10)
**Goal**: Enhanced analytics and cached reports

#### Backend Tasks
1. **Create analytics service**
   - File: `backend/src/services/analyticsService.ts`
   - Stock valuation
   - Turnover calculations
   - Waste analysis

2. **Create report generation**
   - File: `backend/src/services/reportService.ts`
   - Generate and cache reports
   - Scheduled report generation

3. **Create analytics routes**
   - File: `backend/src/routes/inventoryAnalytics.ts`
   - Analytics endpoints
   - Report generation

#### Frontend Tasks
1. **Create analytics dashboard**
   - File: `src/components/manager/InventoryAnalytics.tsx`
   - Stock valuation charts
   - Turnover analysis
   - Waste trends

2. **Create report viewer**
   - File: `src/components/manager/InventoryReports.tsx`
   - View generated reports
   - Export functionality

---

## API Design

### Unified Inventory Endpoints

```
GET    /api/inventory                    # List all inventory items
GET    /api/inventory/:id                # Get item details
POST   /api/inventory                    # Create inventory item
PUT    /api/inventory/:id                # Update inventory item
DELETE /api/inventory/:id                # Delete inventory item

GET    /api/inventory/:id/stock          # Get stock by location
PUT    /api/inventory/:id/stock          # Update stock at location
POST   /api/inventory/:id/adjust         # Adjust stock

GET    /api/inventory/:id/lots           # Get lots for item
POST   /api/inventory/:id/lots           # Create lot

GET    /api/inventory/:id/movements      # Get movements for item
GET    /api/inventory/:id/alerts         # Get alerts for item
```

### Location Endpoints

```
GET    /api/locations                    # List all locations
GET    /api/locations/:id                # Get location details
POST   /api/locations                    # Create location
PUT    /api/locations/:id                # Update location
DELETE /api/locations/:id                # Delete location

GET    /api/locations/:id/stock          # Get stock at location
GET    /api/locations/:id/summary        # Get location summary
```

### Recipe Endpoints

```
GET    /api/recipes                      # List all recipes
GET    /api/recipes/:menuItemId          # Get recipe for menu item
POST   /api/recipes/:menuItemId          # Create/update recipe
DELETE /api/recipes/:menuItemId          # Delete recipe

GET    /api/recipes/:menuItemId/requirements  # Get stock requirements
```

### Lot Endpoints

```
GET    /api/lots                         # List all lots
GET    /api/lots/:id                     # Get lot details
POST   /api/lots                         # Create lot
PUT    /api/lots/:id                     # Update lot
DELETE /api/lots/:id                     # Delete lot

GET    /api/lots/expiring                # Get expiring lots
GET    /api/lots/expired                 # Get expired lots
```

### Cycle Count Endpoints

```
GET    /api/cycle-counts                 # List all cycle counts
GET    /api/cycle-counts/:id             # Get cycle count details
POST   /api/cycle-counts                 # Create cycle count
PUT    /api/cycle-counts/:id             # Update cycle count
DELETE /api/cycle-counts/:id             # Delete cycle count

POST   /api/cycle-counts/:id/start       # Start count
POST   /api/cycle-counts/:id/complete    # Complete count
GET    /api/cycle-counts/:id/variance    # Get variance report
```

### Alert Endpoints

```
GET    /api/alerts                       # List all alerts
GET    /api/alerts/:id                   # Get alert details
PUT    /api/alerts/:id/resolve           # Resolve alert
DELETE /api/alerts/:id                   # Delete alert

GET    /api/alerts/config                # Get alert configuration
PUT    /api/alerts/config                # Update alert configuration
```

---

## Data Models

### Unified Inventory Item

```typescript
interface UnifiedInventoryItem {
  id: string;
  restaurantId: string;
  name: string;
  sku?: string;
  category: string;
  subCategory?: string;
  unitOfMeasure: string;
  unitConversion: number;
  isTracked: boolean;
  isActive: boolean;
  
  // Stock information (per location)
  stockByLocation: {
    locationId: string;
    locationName: string;
    quantity: number;
    reservedQty: number;
    minLevel: number;
    maxLevel: number;
    reorderPoint: number;
    reorderQty: number;
    safetyStock: number;
  }[];
  
  // Total stock
  totalStock: number;
  totalValue: number;
  
  // Linked menu items
  linkedMenuItems: {
    menuItemId: string;
    menuItemName: string;
    quantityPerServing: number;
    unitOfMeasure: string;
  }[];
  
  // Supplier information
  suppliers: {
    supplierId: string;
    supplierName: string;
    unitPrice: number;
    isPrimary: boolean;
  }[];
  
  // Alerts
  activeAlerts: {
    type: string;
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }[];
  
  createdAt: string;
  updatedAt: string;
}
```

### Location

```typescript
interface InventoryLocation {
  id: string;
  restaurantId: string;
  name: string;
  type: 'warehouse' | 'walk_in' | 'dry_store' | 'bar' | 'kitchen' | 'cold_room' | 'freezer' | 'display' | 'other';
  description?: string;
  isActive: boolean;
  capacity?: number;
  temperatureRange?: string;
  
  // Summary
  totalItems: number;
  totalValue: number;
  lowStockItems: number;
  
  createdAt: string;
  updatedAt: string;
}
```

### Recipe Ingredient

```typescript
interface RecipeIngredient {
  id: string;
  restaurantId: string;
  menuItemId: string;
  inventoryItemId: string;
  inventoryItemName: string;
  quantity: number;
  unitOfMeasure: string;
  yieldPercentage: number; // 100% = no waste
  isOptional: boolean;
  
  // Calculated
  stockRequired: number; // for current orders
  stockAvailable: number;
  canFulfill: boolean;
  
  createdAt: string;
  updatedAt: string;
}
```

### Inventory Lot

```typescript
interface InventoryLot {
  id: string;
  restaurantId: string;
  inventoryItemId: string;
  inventoryItemName: string;
  locationId: string;
  locationName: string;
  lotNumber?: string;
  quantity: number;
  unitCost: number;
  totalValue: number;
  receivedDate: string;
  expiryDate?: string;
  supplierId?: string;
  supplierName?: string;
  purchaseOrderId?: string;
  
  // Status
  isExpired: boolean;
  daysUntilExpiry?: number;
  isFullyConsumed: boolean;
  
  createdAt: string;
  updatedAt: string;
}
```

### Cycle Count

```typescript
interface CycleCount {
  id: string;
  restaurantId: string;
  locationId?: string;
  locationName?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  scheduledDate: string;
  completedDate?: string;
  countedBy?: string;
  varianceNotes?: string;
  
  // Summary
  totalItems: number;
  countedItems: number;
  varianceItems: number;
  totalVarianceValue: number;
  
  items: CycleCountItem[];
  
  createdAt: string;
  updatedAt: string;
}

interface CycleCountItem {
  id: string;
  cycleCountId: string;
  inventoryItemId: string;
  inventoryItemName: string;
  locationId: string;
  systemQty: number;
  countedQty?: number;
  variance?: number;
  varianceReason?: string;
  countedBy?: string;
  countedAt?: string;
  verifiedBy?: string;
  verifiedAt?: string;
}
```

### Inventory Alert

```typescript
interface InventoryAlert {
  id: string;
  restaurantId: string;
  alertType: 'low_stock' | 'out_of_stock' | 'expiring_soon' | 'expired' | 'below_par' | 'overstock' | 'count_variance' | 'price_change';
  inventoryItemId?: string;
  inventoryItemName?: string;
  locationId?: string;
  locationName?: string;
  thresholdValue?: number;
  currentValue?: number;
  isResolved: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
}
```

---

## Migration Strategy

### Step 1: Add inventory_item_id to inventory_records
```sql
ALTER TABLE inventory_records 
ADD COLUMN IF NOT EXISTS inventory_item_id text REFERENCES inventory_items(id);

CREATE INDEX IF NOT EXISTS idx_inventory_records_item 
ON inventory_records(inventory_item_id);
```

### Step 2: Migrate existing data
```sql
-- Create inventory_items for existing menu items
INSERT INTO inventory_items (id, restaurant_id, name, category, unit_of_measure)
SELECT 
  'item_' || menu_item_id,
  restaurant_id,
  COALESCE((SELECT name FROM menu WHERE id = menu_item_id), menu_item_id),
  'Uncategorized',
  'unit'
FROM inventory_records
WHERE inventory_item_id IS NULL;

-- Link inventory_records to inventory_items
UPDATE inventory_records 
SET inventory_item_id = 'item_' || menu_item_id
WHERE inventory_item_id IS NULL;
```

### Step 3: Add location_id to inventory_records
```sql
ALTER TABLE inventory_records 
ADD COLUMN IF NOT EXISTS location_id text REFERENCES inventory_locations(id);

CREATE INDEX IF NOT EXISTS idx_inventory_records_location 
ON inventory_records(location_id);
```

### Step 4: Create default location
```sql
INSERT INTO inventory_locations (id, restaurant_id, name, type, description)
SELECT 
  'loc_default_' || id,
  id,
  'Main Storage',
  'warehouse',
  'Default storage location'
FROM restaurants
ON CONFLICT DO NOTHING;
```

### Step 5: Assign default location
```sql
UPDATE inventory_records 
SET location_id = 'loc_default_' || restaurant_id
WHERE location_id IS NULL;
```

---

## Testing Strategy

### Unit Tests
- Inventory service methods
- Recipe calculation logic
- Lot selection algorithms (FIFO/FEFO)
- Alert generation logic

### Integration Tests
- Stock deduction on order placement
- Purchase order receiving with lot creation
- Cycle count variance calculations
- Multi-location stock transfers

### E2E Tests
- Complete order flow with stock deduction
- Purchase order workflow with lot tracking
- Cycle count workflow
- Alert resolution workflow

---

## Performance Considerations

### Database Optimization
1. **Indexes**: Add indexes on frequently queried fields
2. **Partitioning**: Partition stock_movements by timestamp
3. **Materialized Views**: Cache complex analytics queries
4. **Connection Pooling**: Optimize database connections

### Caching Strategy
1. **Redis Cache**: Cache frequently accessed data
   - Stock levels by location
   - Low stock alerts
   - Analytics summaries
2. **Cache Invalidation**: Invalidate on stock changes
3. **TTL Strategy**: Set appropriate TTL for different data types

### API Optimization
1. **Pagination**: Implement pagination for large datasets
2. **Filtering**: Support server-side filtering
3. **Field Selection**: Allow clients to select specific fields
4. **Batch Operations**: Support batch updates

---

## Security Considerations

### Access Control
- Role-based access control (RBAC)
- Location-based access restrictions
- Audit logging for all inventory operations

### Data Validation
- Input validation on all endpoints
- Stock quantity validation (non-negative)
- Expiry date validation (future dates only)

### Transaction Safety
- Use database transactions for stock operations
- Optimistic locking for concurrent updates
- Rollback on failure

---

## Monitoring & Alerts

### Key Metrics to Monitor
1. **Stock Levels**: Items below reorder point
2. **Waste Rate**: Waste as percentage of purchases
3. **Stock Turnover**: How quickly stock is used
4. **Order Fulfillment**: Percentage of orders fulfilled
5. **Cycle Count Accuracy**: Variance percentage

### Alert Thresholds
- **Critical**: Out of stock, expired items
- **High**: Below safety stock, expiring within 3 days
- **Medium**: Below reorder point, expiring within 7 days
- **Low**: Below par level, count variance

---

## Success Criteria

### Functional Requirements
- ✅ Unified inventory system (no dual systems)
- ✅ Location-based stock tracking
- ✅ Recipe-based automatic stock deduction
- ✅ Lot tracking with FIFO/FEFO
- ✅ Cycle count support
- ✅ Proactive alert system
- ✅ Enhanced analytics and reporting

### Non-Functional Requirements
- ✅ Response time < 500ms for inventory queries
- ✅ Support for 10,000+ inventory items
- ✅ 99.9% uptime
- ✅ Real-time stock updates
- ✅ Audit trail for all operations

---

## Timeline Summary

| Sprint | Duration | Focus | Deliverables |
|--------|----------|-------|--------------|
| 1 | Week 1-2 | Foundation | Unified inventory, location tracking |
| 2 | Week 3-4 | Recipes | Recipe management, auto deduction |
| 3 | Week 5-6 | Lots | Lot tracking, FIFO/FEFO |
| 4 | Week 7-8 | Counts & Alerts | Cycle counts, alert system |
| 5 | Week 9-10 | Analytics | Enhanced reporting, dashboards |

**Total Duration**: 10 weeks
**Team Size**: 2-3 developers

---

## Conclusion

This improvement plan addresses the key issues in the current inventory management system while building on the existing solid foundation. The phased approach allows for incremental delivery and validation at each stage.

The unified architecture will provide:
- **Better User Experience**: Single, coherent system
- **Improved Accuracy**: Location-aware, recipe-driven tracking
- **Enhanced Visibility**: Lot tracking, cycle counts, alerts
- **Better Decision Making**: Comprehensive analytics and reporting

By following this plan, Servv will have a world-class inventory management system suitable for hotels, restaurants, and bars of any size.
