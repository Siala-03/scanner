# Waiter Order Entry Feature - Hybrid Approach

## Overview

This feature enables waiters to take orders on behalf of customers using a hybrid approach that supports both QR code scanning and manual table entry. This is particularly useful when:

- Customers don't have smartphones
- Customers prefer waiter service
- Customers call the waiter to order
- The restaurant wants to provide a more personalized service

## Features

### 1. QR Code Scanning
- **Primary Method**: Waiters scan table QR codes using their device camera
- **Fast & Accurate**: Instantly identifies the table number
- **Professional**: Modern, efficient workflow
- **Error Prevention**: No manual entry mistakes

### 2. Manual Table Entry
- **Fallback Method**: Waiters can manually enter table numbers
- **Always Available**: Works even if camera is unavailable
- **Simple**: Quick text input for table number

### 3. Order Entry Interface
- **Full Menu Access**: Browse all available menu items
- **Search & Filter**: Find items by name or category
- **Item Details**: View descriptions, prices, and prep times
- **Quantity Management**: Adjust quantities before adding to order
- **Order Notes**: Add special instructions for the kitchen
- **Cart Management**: Review and modify order before submission

## Components

### QRScanner (`src/components/waiter/QRScanner.tsx`)
- Camera-based QR code scanner
- Real-time QR detection using `jsQR` library
- Flash/torch support for low-light conditions
- Camera switching (front/back)
- Manual entry fallback
- Permission handling

### WaiterOrderEntry (`src/components/waiter/WaiterOrderEntry.tsx`)
- Full-screen order entry interface
- Menu browsing with categories
- Search functionality
- Shopping cart with quantity controls
- Item detail modal
- Order notes
- Submit order functionality

### Updated WaiterDashboard (`src/pages/waiter/WaiterDashboard.tsx`)
- New "Take Order" button in header
- Integration with QR scanner
- Integration with order entry form
- Callback for order creation

## How It Works

### Workflow

1. **Initiate Order Taking**
   - Waiter clicks "Take Order" button in dashboard header
   - QR Scanner opens with camera view

2. **Identify Table**
   - **Option A (QR)**: Waiter scans table's QR code
     - Camera automatically detects and decodes QR
     - Table number is extracted
   - **Option B (Manual)**: Waiter clicks "Manual Entry" button
     - Enters table number in prompt
     - System validates table number

3. **Enter Order**
   - Order entry interface opens for the selected table
   - Waiter browses menu items
   - Clicks items to view details
   - Selects quantity and adds to cart
   - Can add special instructions

4. **Review & Submit**
   - Cart shows all selected items
   - Waiter can adjust quantities or remove items
   - Adds any order-level notes
   - Submits order to kitchen

5. **Order Processing**
   - Order is created with table number
   - Kitchen receives order notification
   - Order appears in waiter's dashboard

## Technical Implementation

### Dependencies
- `jsqr`: QR code decoding library
- `@types/jsqr`: TypeScript type definitions

### Key Features

#### Camera Access
```typescript
const stream = await navigator.mediaDevices.getUserMedia({
  video: {
    facingMode: 'environment', // Use back camera by default
    width: { ideal: 1280 },
    height: { ideal: 720 }
  }
});
```

#### QR Decoding
```typescript
const qrCode = jsQR(imageData.data, imageData.width, imageData.height, {
  inversionAttempts: 'dontInvert',
});
```

#### QR Code Format
Expected formats:
- `TABLE:5` - Table number with prefix
- `5` - Just the table number
- Any format that can be parsed to extract table number

### Order Creation

The `onCreateOrder` callback is called when waiter submits order:

```typescript
onCreateOrder?: (
  tableNumber: number,
  items: OrderItem[],
  notes?: string
) => Promise<void>
```

## Usage

### 1. Ensure Table QR Codes Exist
Each table should have a QR code that encodes the table number. Format:
- Simple: `5` (just the number)
- Prefixed: `TABLE:5`

### 2. Waiter Logs In
Waiter accesses their dashboard with assigned tables.

### 3. Click "Take Order"
Button appears in the header with QR code icon.

### 4. Scan or Enter Table
- Point camera at table QR code
- Or click "Manual Entry" and type table number

### 5. Build Order
- Browse menu categories
- Search for specific items
- Click items to view details
- Select quantity and add to cart
- Add notes if needed

### 6. Submit Order
- Review cart items
- Add order-level notes
- Click "Submit Order"
- Order is sent to kitchen

## Benefits

### For Waiters
- ✅ **Faster Service**: No need to remember orders or write them down
- ✅ **Fewer Errors**: Digital order entry reduces mistakes
- ✅ **Professional**: Modern tool that improves service quality
- ✅ **Efficient**: Quick access to full menu and pricing

### For Customers
- ✅ **Better Experience**: Waiter can provide personalized recommendations
- ✅ **No App Required**: Customers don't need to download anything
- ✅ **Accessibility**: Works for all customers regardless of tech comfort
- ✅ **Faster**: Orders go directly to kitchen

### For Restaurant
- ✅ **Flexibility**: Supports both digital and traditional service
- ✅ **Reliability**: Fallback options ensure service continuity
- ✅ **Data**: All orders tracked digitally
- ✅ **Scalability**: Works for any number of tables

## Best Practices

### QR Code Placement
- Place QR codes prominently on tables
- Ensure they're clean and undamaged
- Use durable materials (laminated or printed on table surface)
- Consider placing at edge of table for easy scanning

### Waiter Training
- Train waiters on both scanning and manual entry
- Practice QR scanning technique (distance, angle, lighting)
- Explain when to use each method
- Demonstrate order entry workflow

### Lighting Conditions
- Use flash in low-light environments
- Ensure QR codes are well-lit
- Avoid glare on laminated codes

### Performance Tips
- Keep camera lens clean
- Hold device steady while scanning
- Position QR code within the frame guides
- Use manual entry for quick single-table orders

## Troubleshooting

### Camera Not Working
- Check browser permissions
- Ensure device has a camera
- Try manual entry as fallback

### QR Not Scanning
- Clean QR code surface
- Adjust distance (usually 6-12 inches)
- Ensure good lighting
- Try different angle
- Use manual entry

### Order Not Submitting
- Check internet connection
- Verify table number is valid
- Ensure at least one item in cart
- Check for error messages

## Future Enhancements

### Potential Features
- **Table Selection UI**: Visual table map for manual selection
- **Order Templates**: Quick-add common orders
- **Voice Notes**: Dictate special instructions
- **Offline Mode**: Save orders locally when offline
- **Multi-table Orders**: Handle orders for multiple tables at once
- **Order Modification**: Edit pending orders
- **Split Bills**: Split order items across checks
- **Course Management**: Organize items by course (appetizer, main, dessert)

### Technical Improvements
- **Barcode Support**: Scan product barcodes for inventory items
- **Multiple QR Formats**: Support various QR code standards
- **Batch Scanning**: Scan multiple tables quickly
- **Analytics**: Track waiter order-taking speed and accuracy

## Support

For issues or questions:
1. Check this documentation
2. Review the component code comments
3. Test in development environment
4. Contact development team

## Version History

### v1.0.0 (Initial Release)
- QR code scanning with camera
- Manual table entry
- Full order entry interface
- Menu browsing and search
- Cart management
- Order submission

---

**Note**: This feature integrates with the existing order management system and uses the same backend APIs for order creation.