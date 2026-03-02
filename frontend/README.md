# AI Accounting Frontend

React-based enterprise dashboard for the AI Accounting SaaS.

## 🛠 Tech Stack
- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS + Flowbite React
- **State Management**: Zustand
- **Charts**: Recharts
- **Icons**: Lucide React

## 📦 Key Features
- **Multi-tenant Authentication**: Handles JWT tokens via secure HttpOnly cookies.
- **Dynamic Dashboards**: Responsive layouts with Recharts integration.
- **AI Agent Integration**: Built-in chat interface for financial queries.
- **Voucher Management**: Complex form handling for Sales, Purchase, and Journal vouchers.
- **Inventory Tracking**: Category-wise stock management with wizard-based setup.

## 🚀 Getting Started

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment**:
   Create a `.env` file:
   ```env
   VITE_API_BASE_URL=http://localhost:8000
   ```

3. **Run Development Server**:
   ```bash
   npm run dev
   ```

4. **Build for Production**:
   ```bash
   npm run build
   ```

## 🏗 Directory Structure
- `src/app`: Application entry points and routing.
- `src/components`: Generic reusable UI elements (Buttons, Tables, Modals).
- `src/pages`: Feature-specific modules (Accounting, Inventory, Reports).
- `src/services`: API communication layer using Axios.
- `src/store`: Global state management logic.
- `src/hooks`: Custom React hooks for reuse.

## 🛡 Security
- Tokens are stored in **HttpOnly Cookies**, which prevents XSS-based token theft.
- **Role-Based Access Control (RBAC)** is enforced locally to hide/show UI elements based on user permissions returned from the backend.
