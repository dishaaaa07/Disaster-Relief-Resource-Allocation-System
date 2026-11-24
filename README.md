# Disaster Relief Resource Allocation System (DRRACS)

An intelligent, full-stack disaster management and resource logistics web platform designed to streamline emergency requests, monitor multi-warehouse relief inventories, and allocate critical supplies to disaster-affected communities using an automated triage prioritization algorithm.

---

## 1. Project Overview

During natural disasters such as floods, cyclones, and earthquakes, coordinating emergency aid across multiple relief hubs and evacuation shelters is a logistical challenge. **DRRACS (Disaster Relief Resource Allocation System)** provides authorities, relief officers, shelter managers, and citizens with a unified operations dashboard. 

The system tracks active disaster incidents, maintains live stock levels across regional warehouses, processes multi-item relief requests, dynamically scores request urgency, and logs shipments with secure delivery verification.

---

## 2. Problem Statement

In the aftermath of a crisis, disaster response efforts often suffer from:
- **Fragmented Communication:** Lack of a centralized pipeline between field shelters and central logistics hubs.
- **Mismatched Allocation:** Some relief camps receive duplicate shipments while more remote or critical camps experience severe shortages.
- **Inventory Blindspots:** Inability to track real-time stock balances across distributed warehouses.
- **Aid Diversion & Lack of Accountability:** Missing chain-of-custody tracking from warehouse dispatch to on-the-ground receipt.

---

## 3. Proposed Solution

DRRACS introduces a structured, technology-driven relief distribution framework:
- **Role-Based Access Control (RBAC):** Dedicated views and permissions for Administrators, Relief Officers, Shelter Leads, and Citizens.
- **Automated Triage Prioritization Engine:** An intelligent scoring formula that evaluates request urgency, disaster incident severity, shelter overcrowding ratios, and waiting times.
- **Relational Inventory Ledger:** Real-time stock reservation and deduction to prevent double allocations.
- **Verified Chain of Custody:** Dispatches generate vehicle transport manifests and 6-digit One-Time Passwords (OTPs) for shelter receipt verification.
- **Complete Audit Trail:** Automatic activity logging for administrative accountability and transparency.

---

## 4. Key Features

- **Disaster Incident & Area Tracking:** Register and monitor disaster zones with severity levels (*Low, Medium, High, Critical*), geographic coordinates, and affected populations.
- **Shelter & Warehouse Management:** Track capacities and real-time occupancy levels across regional shelters and storage depots.
- **Relief Supply Catalog & Inventory Control:** Centralized catalog of essential relief items (drinking water, food packets, medical kits, tents) with stock tracking per warehouse.
- **Relief Request Registration:** Shelter managers and citizens can submit multi-item emergency requests with justification and priority indicators.
- **Intelligent Triage & Priority Scoring:** Computes a dynamic priority score (10.0 to 100.0) to ensure high-vulnerability and long-waiting requests are served first.
- **Transaction-Safe Allocation:** Matches approved requests against available warehouse stock.
- **Shipment Logistics & Delivery OTP:** Tracks shipments from *Preparing* &rarr; *In Transit* &rarr; *Delivered*, requiring a 6-digit verification code to confirm arrival.
- **Administrative Analytics & Audit Logging:** Comprehensive metrics on total relief distributed, pending vs. fulfilled requests, and operational history.

---

## 5. Technologies Used

### Frontend
- **HTML5:** Semantic layouts and forms.
- **CSS3:** Custom responsive styling with CSS Grid and Flexbox.
- **JavaScript (Vanilla ES6+):** Dynamic client-side rendering, asynchronous API communication via `fetch`, and JWT session management.

### Backend
- **Node.js:** Server runtime environment.
- **Express.js:** Modular RESTful API architecture.
- **bcryptjs:** Cryptographic password hashing (salt rounds: 10).
- **jsonwebtoken (JWT):** Stateless authentication and role-guard middleware.
- **dotenv:** Environment variable management.
- **cors:** Cross-Origin Resource Sharing handling.

### Database
- **MySQL 8.0+:** Relational database management system with InnoDB engine supporting foreign key constraints, check constraints, and ACID transactions.
- **mysql2/promise:** High-performance async connection pooling.
- **MySQL Workbench:** Schema modeling, ERD design, and SQL query execution.

---

## 6. Project Folder Structure

```
Disaster-Relief-Resource-Allocation-System/
├── config/
│   └── db.js                       # MySQL connection pool setup and health check
├── controllers/
│   ├── allocation.controller.js    # Stock reservation and request fulfillment logic
│   ├── audit.controller.js         # Audit log retrieval and KPI metrics computation
│   ├── auth.controller.js          # User registration, login, and JWT generation
│   ├── disaster.controller.js      # Disaster incident and citizen report handlers
│   ├── location.controller.js      # Geo-location and affected area management
│   ├── request.controller.js       # Relief request intake and status updates
│   ├── shelter.controller.js       # Shelter capacity and occupancy management
│   ├── shipment.controller.js      # Dispatch creation and OTP delivery verification
│   ├── stock.controller.js         # Warehouse inventory intake and adjustments
│   └── supply.controller.js        # Catalog of relief supplies
├── database/
│   ├── init.js                     # Automated database creation and seed script
│   ├── migrate-citizen-role.js     # Schema migration script for Citizen role
│   └── schema.sql                  # Full 11-table DDL schema with demonstration data
├── middleware/
│   ├── auth.js                     # JWT verification middleware
│   └── checkRole.js                # Role-Based Access Control (RBAC) guard
├── public/
│   ├── css/
│   │   └── style.css               # Complete responsive dashboard stylesheet
│   ├── js/
│   │   └── app.js                  # Frontend controllers and UI state management
│   └── index.html                  # Single-page dashboard application interface
├── routes/
│   ├── allocation.routes.js        # Allocation endpoints
│   ├── audit.routes.js             # Audit and metrics endpoints
│   ├── auth.routes.js              # Authentication endpoints
│   ├── disaster.routes.js          # Disaster management endpoints
│   ├── location.routes.js          # Location endpoints
│   ├── request.routes.js           # Request endpoints
│   ├── shelter.routes.js           # Shelter endpoints
│   ├── shipment.routes.js          # Shipment logistics endpoints
│   ├── stock.routes.js             # Warehouse stock endpoints
│   └── supply.routes.js            # Supply catalog endpoints
├── services/
│   └── triageScorer.js             # Weighted priority calculation engine
├── .env.example                    # Environment variable template
├── .gitignore                      # Excluded files and secret patterns
├── package.json                    # Project dependencies and npm scripts
├── README.md                       # Complete project documentation
└── server.js                       # Express application entry point
```

---

## 7. Prerequisites

Before installing and running the project, ensure you have the following installed on your machine:
- **Node.js** (v16.x or higher) & **npm** (v8.x or higher) - [Download Node.js](https://nodejs.org/)
- **MySQL Server** (v8.0 or higher) - [Download MySQL](https://dev.mysql.com/downloads/mysql/)
- **MySQL Workbench** (Optional, recommended for visual database inspection) - [Download Workbench](https://dev.mysql.com/downloads/workbench/)
- **Git** - [Download Git](https://git-scm.com/)

---

## 8. Installation & Setup Instructions

### Step 1: Clone or Open the Repository
```bash
git clone https://github.com/<your-username>/Disaster-Relief-Resource-Allocation-System.git
cd Disaster-Relief-Resource-Allocation-System
```

### Step 2: Install Node.js Dependencies
Install all required runtime and development dependencies:
```bash
npm install
```

---

## 9. Environment Variable Configuration

Create a `.env` file in the root directory by copying the provided `.env.example` template:

```bash
# On Windows (Command Prompt / PowerShell)
copy .env.example .env

# On Linux / macOS
cp .env.example .env
```

Open `.env` in a text editor and fill in your local MySQL credentials:

```env
# Server Port
PORT=5000

# MySQL Database Credentials
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_actual_mysql_password
DB_NAME=disaster_relief_db
DB_PORT=3306

# Authentication Secret (Any secure string)
JWT_SECRET=super_secret_disaster_relief_key_2026
```

---

## 10. MySQL Database Setup

Ensure your local MySQL service is running. You can set up the database using either of the following two methods:

### Method A: Automated CLI Script (Recommended)
Run the built-in database initialization script. This creates the `disaster_relief_db` database, generates all 11 relational tables, and populates sample demonstration data with hashed passwords:

```bash
npm run init-db
```

### Method B: Manual Import via MySQL Workbench
1. Open **MySQL Workbench** and connect to your local MySQL instance.
2. Open the file `database/schema.sql` (`File` &rarr; `Open SQL Script...`).
3. Click the **Execute (Lightning Bolt)** icon to execute the entire script.
4. Refresh the schemas tab to confirm that `disaster_relief_db` is created.

---

## 11. Default Demonstration Accounts

The database comes pre-seeded with 4 user accounts for immediate evaluation:

| Role | Email | Password | Access Capabilities |
|:---|:---|:---|:---|
| **Admin** | `admin@drracs.org` | `admin123` | Full system control, activity logs, KPIs, user management |
| **Relief Officer** | `officer@drracs.org` | `admin123` | Request triage, priority scoring, inventory allocation, shipment dispatch |
| **Shelter Manager** | `shelter@drracs.org` | `admin123` | Emergency request creation, occupancy updates, shipment receipt (OTP) |
| **Citizen** | `citizen@drracs.org` | `admin123` | Incident reporting, public shelter directory, aid status tracking |

---

## 12. How to Run the Application

### Start the Server (Production Mode)
```bash
npm start
```

### Start the Server with Auto-Reload (Development Mode)
```bash
npm run dev
```

Once started, the backend logs will confirm:
```
==================================================
🚀 DRRACS Server running on http://localhost:5000
📡 Health Check URL: http://localhost:5000/api/health
✅ Successfully connected to MySQL Database: "disaster_relief_db"
==================================================
```

### Accessing the Web Application
Open your web browser and navigate to:
```
http://localhost:5000
```
The static frontend files in `public/` are served automatically by Express.

---

## 13. Available API Endpoints

All protected endpoints require the HTTP header: `Authorization: Bearer <JWT_TOKEN>`.

### Authentication (`/api/auth`)
| Method | Endpoint | Access | Description |
|:---|:---|:---|:---|
| `POST` | `/api/auth/register` | Public | Register a new user account |
| `POST` | `/api/auth/login` | Public | Authenticate and obtain JWT token |
| `GET` | `/api/auth/profile` | Authenticated | Retrieve current user profile |

### Disasters (`/api/disasters`)
| Method | Endpoint | Access | Description |
|:---|:---|:---|:---|
| `GET` | `/api/disasters` | Admin, Officer, Shelter Lead | List all disaster incidents |
| `POST` | `/api/disasters` | Admin | Register a new disaster incident |
| `PUT` | `/api/disasters/:id` | Admin, Officer | Update disaster status or severity |
| `DELETE` | `/api/disasters/:id` | Admin | Remove a disaster record |
| `POST` | `/api/disasters/citizen-report` | Citizen | Submit an incident report from the ground |
| `GET` | `/api/disasters/track/:ticket` | Admin, Officer, Citizen | Track a submitted citizen report by ticket |

### Locations & Shelters (`/api/locations`, `/api/shelters`)
| Method | Endpoint | Access | Description |
|:---|:---|:---|:---|
| `GET` | `/api/locations` | Admin, Officer, Shelter Lead | List affected areas and warehouses |
| `POST` | `/api/locations` | Admin, Officer | Register a new location with coordinates |
| `GET` | `/api/shelters` | All Authenticated | List all relief shelters and occupancy |
| `POST` | `/api/shelters` | Admin, Officer | Create a new shelter entry |
| `PUT` | `/api/shelters/:id` | Admin, Officer, Shelter Lead | Update shelter capacity or resident count |

### Supplies & Warehouse Stock (`/api/supplies`, `/api/stock`)
| Method | Endpoint | Access | Description |
|:---|:---|:---|:---|
| `GET` | `/api/supplies` | Admin, Officer, Shelter Lead | Retrieve relief supply catalog |
| `POST` | `/api/supplies` | Admin, Officer | Add a new supply item to catalog |
| `GET` | `/api/stock` | Admin, Officer | View live stock balances across warehouses |
| `POST` | `/api/stock` | Admin, Officer | Record incoming supply shipments to stock |
| `PUT` | `/api/stock/:id` | Admin, Officer | Adjust warehouse inventory levels |

### Relief Requests & Allocations (`/api/requests`, `/api/allocations`)
| Method | Endpoint | Access | Description |
|:---|:---|:---|:---|
| `GET` | `/api/requests` | Admin, Officer, Shelter Lead | View aid requests with priority scores |
| `POST` | `/api/requests` | Admin, Officer, Shelter Lead | Submit a new multi-item relief request |
| `PUT` | `/api/requests/:id/status` | Admin, Officer | Update request status (*Approved, Rejected*) |
| `GET` | `/api/allocations` | Admin, Officer | View active supply allocations |
| `POST` | `/api/allocations` | Admin, Officer | Allocate warehouse stock to request items |

### Logistics & Verification (`/api/shipments`, `/api/audit-logs`)
| Method | Endpoint | Access | Description |
|:---|:---|:---|:---|
| `GET` | `/api/shipments` | Admin, Officer, Shelter Lead | Track dispatches and transit status |
| `POST` | `/api/shipments` | Admin, Officer | Dispatch shipment with vehicle & driver info |
| `POST` | `/api/shipments/:id/verify-delivery` | Admin, Officer, Shelter Lead | Confirm delivery using 6-digit OTP code |
| `GET` | `/api/audit-logs` | Admin | Review system activity audit logs |
| `GET` | `/api/audit-logs/metrics` | Admin | Get executive dashboard statistics |

---

## 14. Future Scope

- **Interactive GIS Heatmaps:** Integration with Leaflet.js and OpenStreetMap to display real-time disaster perimeters and truck route corridors.
- **Offline-First Field Capability:** Service worker caching and IndexedDB storage allowing shelter managers to log data without cellular connectivity.
- **Automated SMS Alerts:** Automated SMS gateways (e.g., Twilio) to dispatch shipment ETAs directly to basic feature phones.
- **Biometric / QR Code Handover:** Digital signature or QR scan validation for high-value medication consignments.
- **Inter-Agency Data Exchange:** Secure API bridges for external humanitarian agencies (e.g., Red Cross, UNICEF) to prevent duplicate aid distribution.

---

## 15. License

This project is developed for academic, educational, and disaster management research purposes under the **ISC License**.
