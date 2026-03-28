# Servv Inventory Management - Architecture Diagram

## Current vs Improved Architecture

### Current Architecture (Issues)

```
┌─────────────────────────────────────────────────────────────────┐
│                        CURRENT SYSTEM                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐      ┌─────────────────┐                  │
│  │ inventory_records│      │ inventory_items │                  │
│  │ (Basic)         │      │ (Enterprise)    │                  │
│  │                 │      │                 │                  │
│  │ • menu_item_id  │      │ • id            │                  │
│  │ • stock         │      │ • name          │                  │
│  │ • location(text)│      │ • category      │                  │
│  │                 │      │ • unit_of_measure│                 │
│  └────────┬────────┘      └────────┬────────┘                  │
│           │                        │                            │
│           │    NOT LINKED!         │                            │
│           │                        │                            │
│  ┌────────▼────────┐      ┌────────▼────────┐                  │
│  │ stock_movements │      │ inventory_stock │                  │
│  │ (Basic)         │      │ (Unused)        │                  │
│  │                 │      │                 │                  │
│  │ • menu_item_id  │      │ • inventory_item_id│               │
│  │ • type          │      │ • location_id   │                  │
│  │ • qty           │      │ • quantity      │                  │
│  └─────────────────┘      └─────────────────┘                  │
│                                                                  │
│  PROBLEMS:                                                       │
│  ❌ Two separate systems not connected                          │
│  ❌ Location is just text, not FK                               │
│  ❌ Recipe ingredients not used for deduction                   │
│  ❌ Lot tracking tables exist but unused                        │
│  ❌ No cycle count support                                      │
│  ❌ No persistent alerts                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Improved Architecture (Solution)

```
┌─────────────────────────────────────────────────────────────────┐
│                       IMPROVED SYSTEM                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  UNIFIED INVENTORY                       │   │
│  │                                                          │   │
│  │  ┌─────────────────┐    ┌─────────────────┐            │   │
│  │  │ inventory_items │◄───│ recipe_ingredients│           │   │
│  │  │ (Master Items)  │    │ (Menu Link)     │            │   │
│  │  │                 │    │                 │            │   │
│  │  │ • id            │    │ • menu_item_id  │            │   │
│  │  │ • name          │    │ • inventory_item_id│         │   │
│  │  │ • category      │    │ • quantity      │            │   │
│  │  │ • unit_of_measure│   │ • yield_percentage│          │   │
│  │  └────────┬────────┘    └─────────────────┘            │   │
│  │           │                                              │   │
│  │           │ 1:N                                          │   │
│  │           ▼                                              │   │
│  │  ┌─────────────────┐    ┌─────────────────┐            │   │
│  │  │ inventory_stock │◄───│inventory_locations│           │   │
│  │  │ (Per Location)  │    │ (Physical Places)│           │   │
│  │  │                 │    │                 │            │   │
│  │  │ • inventory_item_id│ │ • id            │            │   │
│  │  │ • location_id   │    │ • name          │            │   │
│  │  │ • quantity      │    │ • type          │            │   │
│  │  │ • min_level     │    │ • capacity      │            │   │
│  │  │ • max_level     │    │ • temperature   │            │   │
│  │  └────────┬────────┘    └─────────────────┘            │   │
│  │           │                                              │   │
│  │           │ 1:N                                          │   │
│  │           ▼                                              │   │
│  │  ┌─────────────────┐    ┌─────────────────┐            │   │
│  │  │ inventory_lots  │◄───│   suppliers     │            │   │
│  │  │ (Batch Tracking)│    │ (Vendors)       │            │   │
│  │  │                 │    │                 │            │   │
│  │  │ • inventory_item_id│ │ • id            │            │   │
│  │  │ • location_id   │    │ • name          │            │   │
│  │  │ • lot_number    │    │ • contact_person│            │   │
│  │  │ • quantity      │    │ • lead_time_days│            │   │
│  │  │ • expiry_date   │    └─────────────────┘            │   │
│  │  └─────────────────┘                                    │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  MOVEMENT TRACKING                       │   │
│  │                                                          │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │           stock_movements_enhanced               │   │   │
│  │  │                                                  │   │   │
│  │  │  • inventory_item_id                            │   │   │
│  │  │  • from_location_id ───────────────────────────►│   │   │
│  │  │  • to_location_id ─────────────────────────────►│   │   │
│  │  │  • movement_type (purchase|sale|adjustment|...) │   │   │
│  │  │  • quantity                                      │   │   │
│  │  │  • lot_id ─────────────────────────────────────►│   │   │
│  │  │  • reference_id (order_id, po_id, etc.)        │   │   │
│  │  │  • performed_by                                 │   │   │
│  │  │  • timestamp                                    │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  ALERTS & MONITORING                     │   │
│  │                                                          │   │
│  │  ┌─────────────────┐    ┌─────────────────┐            │   │
│  │  │inventory_alerts │    │ cycle_counts    │            │   │
│  │  │                 │    │                 │            │   │
│  │  │ • alert_type    │    │ • location_id   │            │   │
│  │  │ • inventory_item_id│ │ • status        │            │   │
│  │  │ • location_id   │    │ • scheduled_date│            │   │
│  │  │ • threshold     │    │ • counted_by    │            │   │
│  │  │ • current_value │    │ • variance_notes│            │   │
│  │  │ • is_resolved   │    └─────────────────┘            │   │
│  │  └─────────────────┘                                    │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  BENEFITS:                                                       │
│  ✅ Single unified system                                       │
│  ✅ Location-aware stock tracking                               │
│  ✅ Recipe-based automatic deduction                            │
│  ✅ Lot tracking with FIFO/FEFO                                 │
│  ✅ Cycle count support                                         │
│  ✅ Persistent alert management                                 │
│  ✅ Full audit trail                                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagrams

### 1. Order Placement Flow (Recipe-Based Deduction)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Customer   │     │   Order      │     │   Recipe     │
│   Places     │────►│   Service    │────►│   Service    │
│   Order      │     │              │     │              │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                                  │ Get ingredients
                                                  │ for menu items
                                                  ▼
                                          ┌──────────────┐
                                          │   recipe_    │
                                          │   ingredients│
                                          └──────┬───────┘
                                                  │
                                                  │ For each ingredient
                                                  ▼
                                          ┌──────────────┐
                                          │  inventory_  │
                                          │  stock       │
                                          │  (Lock row)  │
                                          └──────┬───────┘
                                                  │
                                                  │ Deduct quantity
                                                  ▼
                                          ┌──────────────┐
                                          │  Update      │
                                          │  stock       │
                                          └──────┬───────┘
                                                  │
                                                  │ Record movement
                                                  ▼
                                          ┌──────────────┐
                                          │  stock_      │
                                          │  movements_  │
                                          │  enhanced    │
                                          └──────┬───────┘
                                                  │
                                                  │ Check thresholds
                                                  ▼
                                          ┌──────────────┐
                                          │  inventory_  │
                                          │  alerts      │
                                          │  (if needed) │
                                          └──────────────┘
```

### 2. Purchase Order Receiving Flow (Lot Creation)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Manager    │     │   Purchase   │     │   Receive    │
│   Creates    │────►│   Order      │────►│   Items      │
│   PO         │     │              │     │              │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                                  │ For each item
                                                  ▼
                                          ┌──────────────┐
                                          │  Create      │
                                          │  inventory_  │
                                          │  lot         │
                                          └──────┬───────┘
                                                  │
                                                  │ Set lot details
                                                  │ • lot_number
                                                  │ • quantity
                                                  │ • expiry_date
                                                  │ • unit_cost
                                                  ▼
                                          ┌──────────────┐
                                          │  Update      │
                                          │  inventory_  │
                                          │  stock       │
                                          └──────┬───────┘
                                                  │
                                                  │ Record movement
                                                  │ • type: 'purchase'
                                                  │ • lot_id reference
                                                  ▼
                                          ┌──────────────┐
                                          │  stock_      │
                                          │  movements_  │
                                          │  enhanced    │
                                          └──────────────┘
```

### 3. Cycle Count Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Manager    │     │   Create     │     │   Schedule   │
│   Schedules  │────►│   Cycle      │────►│   Count      │
│   Count      │     │   Count      │     │              │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                                  │ Staff counts items
                                                  ▼
                                          ┌──────────────┐
                                          │   Record     │
                                          │   Counted    │
                                          │   Quantities │
                                          └──────┬───────┘
                                                  │
                                                  │ Calculate variance
                                                  │ (counted - system)
                                                  ▼
                                          ┌──────────────┐
                                          │   Update     │
                                          │   cycle_     │
                                          │   count_items│
                                          └──────┬───────┘
                                                  │
                                                  │ If variance > 0
                                                  ▼
                                          ┌──────────────┐
                                          │   Create     │
                                          │   Alert      │
                                          │   (variance) │
                                          └──────┬───────┘
                                                  │
                                                  │ Adjust stock if needed
                                                  ▼
                                          ┌──────────────┐
                                          │   Update     │
                                          │   inventory_ │
                                          │   stock      │
                                          └──────────────┘
```

---

## API Endpoint Structure

```
/api
├── /inventory
│   ├── GET /                    # List all items
│   ├── GET /:id                 # Get item details
│   ├── POST /                   # Create item
│   ├── PUT /:id                 # Update item
│   ├── DELETE /:id              # Delete item
│   ├── GET /:id/stock           # Get stock by location
│   ├── PUT /:id/stock           # Update stock at location
│   ├── POST /:id/adjust         # Adjust stock
│   ├── GET /:id/lots            # Get lots for item
│   ├── POST /:id/lots           # Create lot
│   ├── GET /:id/movements       # Get movements
│   └── GET /:id/alerts          # Get alerts
│
├── /locations
│   ├── GET /                    # List all locations
│   ├── GET /:id                 # Get location details
│   ├── POST /                   # Create location
│   ├── PUT /:id                 # Update location
│   ├── DELETE /:id              # Delete location
│   ├── GET /:id/stock           # Get stock at location
│   └── GET /:id/summary         # Get location summary
│
├── /recipes
│   ├── GET /                    # List all recipes
│   ├── GET /:menuItemId         # Get recipe for menu item
│   ├── POST /:menuItemId        # Create/update recipe
│   ├── DELETE /:menuItemId      # Delete recipe
│   └── GET /:menuItemId/requirements  # Get stock requirements
│
├── /lots
│   ├── GET /                    # List all lots
│   ├── GET /:id                 # Get lot details
│   ├── POST /                   # Create lot
│   ├── PUT /:id                 # Update lot
│   ├── DELETE /:id              # Delete lot
│   ├── GET /expiring            # Get expiring lots
│   └── GET /expired             # Get expired lots
│
├── /cycle-counts
│   ├── GET /                    # List all cycle counts
│   ├── GET /:id                 # Get cycle count details
│   ├── POST /                   # Create cycle count
│   ├── PUT /:id                 # Update cycle count
│   ├── DELETE /:id              # Delete cycle count
│   ├── POST /:id/start         # Start count
│   ├── POST /:id/complete      # Complete count
│   └── GET /:id/variance       # Get variance report
│
├── /alerts
│   ├── GET /                    # List all alerts
│   ├── GET /:id                 # Get alert details
│   ├── PUT /:id/resolve         # Resolve alert
│   ├── DELETE /:id              # Delete alert
│   ├── GET /config              # Get alert configuration
│   └── PUT /config              # Update alert configuration
│
├── /suppliers
│   ├── GET /                    # List all suppliers
│   ├── GET /:id                 # Get supplier details
│   ├── POST /                   # Create supplier
│   ├── PUT /:id                 # Update supplier
│   └── DELETE /:id              # Delete supplier
│
├── /purchase-orders
│   ├── GET /                    # List all POs
│   ├── GET /:id                 # Get PO details
│   ├── POST /                   # Create PO
│   ├── PUT /:id                 # Update PO
│   ├── DELETE /:id              # Delete PO
│   └── POST /:id/receive        # Receive PO items
│
├── /movements
│   ├── GET /                    # List all movements
│   ├── GET /:id                 # Get movement details
│   ├── POST /                   # Create movement
│   └── GET /summary/overview    # Get movement summary
│
└── /waste
    ├── GET /                    # List all waste entries
    ├── GET /:id                 # Get waste entry details
    ├── POST /                   # Record waste
    └── GET /summary/overview    # Get waste summary
```

---

## Database Schema Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                    DATABASE SCHEMA                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  restaurants                                                     │
│      │                                                           │
│      ├──► inventory_items (1:N)                                 │
│      │         │                                                 │
│      │         ├──► inventory_stock (1:N)                       │
│      │         │         │                                       │
│      │         │         └──► inventory_locations (N:1)         │
│      │         │                                                 │
│      │         ├──► inventory_lots (1:N)                        │
│      │         │         │                                       │
│      │         │         ├──► inventory_locations (N:1)         │
│      │         │         └──► suppliers (N:1)                   │
│      │         │                                                 │
│      │         ├──► recipe_ingredients (1:N)                    │
│      │         │         │                                       │
│      │         │         └──► menu (N:1)                        │
│      │         │                                                 │
│      │         ├──► stock_movements_enhanced (1:N)              │
│      │         │         │                                       │
│      │         │         ├──► inventory_locations (N:1) from    │
│      │         │         ├──► inventory_locations (N:1) to      │
│      │         │         └──► inventory_lots (N:1)              │
│      │         │                                                 │
│      │         ├──► waste_entries_enhanced (1:N)                │
│      │         │         │                                       │
│      │         │         ├──► inventory_locations (N:1)         │
│      │         │         └──► inventory_lots (N:1)              │
│      │         │                                                 │
│      │         └──► inventory_alerts (1:N)                      │
│      │                                                           │
│      ├──► inventory_locations (1:N)                             │
│      │         │                                                 │
│      │         └──► cycle_counts (1:N)                          │
│      │                   │                                       │
│      │                   └──► cycle_count_items (1:N)           │
│      │                                                           │
│      ├──► suppliers (1:N)                                       │
│      │         │                                                 │
│      │         ├──► purchase_orders (1:N)                       │
│      │         │         │                                       │
│      │         │         └──► inventory_lots (1:N)              │
│      │         │                                                 │
│      │         ├──► supplier_prices (1:N)                       │
│      │         │                                                 │
│      │         └──► supplier_performance (1:N)                  │
│      │                                                           │
│      └──► inventory_reports (1:N)                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Improvements Summary

| Feature | Current | Improved |
|---------|---------|----------|
| **Inventory Items** | Dual system (records + items) | Unified (items only) |
| **Location Tracking** | Text field | Foreign key to locations table |
| **Stock Tracking** | Global (per item) | Per location |
| **Recipe Integration** | Not used | Automatic deduction |
| **Lot Tracking** | Tables exist, unused | Full FIFO/FEFO support |
| **Cycle Counts** | Tables exist, unused | Full support with API |
| **Alerts** | WebSocket only | Persistent storage + WebSocket |
| **Analytics** | On-the-fly | Cached reports |
| **Audit Trail** | Basic movements | Enhanced with locations/lots |

---

## Implementation Priority

### Phase 1 (Critical) - Week 1-2
- ✅ Unified inventory service
- ✅ Location management
- ✅ Database migration

### Phase 2 (High) - Week 3-4
- ✅ Recipe-based deduction
- ✅ Stock requirement calculations

### Phase 3 (Medium) - Week 5-6
- ✅ Lot tracking
- ✅ FIFO/FEFO selection

### Phase 4 (Medium) - Week 7-8
- ✅ Cycle counts
- ✅ Alert management

### Phase 5 (Low) - Week 9-10
- ✅ Enhanced analytics
- ✅ Report caching
