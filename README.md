Markdown
# ES Analytics Dashboard

A full-stack analytics dashboard application designed to track, aggregate, and display UTM-based traffic data. The project consists of a **Next.js frontend** and a **NestJS backend** connected to a PostgreSQL database and Google Cloud BigQuery.

## 🏗 Repository Structure

This repository contains two main directories:
- `/analytics-api` - The NestJS backend application.
- `/analytics-dashboard` - The Next.js frontend web application.

---

## 📋 Prerequisites

Before you begin, ensure you have the following installed on your machine:
- **Node.js** (v18 or higher recommended)
- **npm** or **yarn**
- **PostgreSQL** (Running locally or accessible via a remote URI)
- **Google Cloud Service Account** (JSON key file) with BigQuery access (for fetching analytics data).

---

## 🚀 Part 1: Backend Setup (`analytics-api`)

The backend is built with NestJS and uses TypeORM to connect to PostgreSQL.

### 1. Navigate to the backend directory
```bash
cd analytics-api
2. Install dependencies
Bash
npm install
3. Environment Variables
Create a .env file in the root of the analytics-api directory. Add the following variables and adjust the database credentials to match your local PostgreSQL setup:

Code snippet
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_NAME=analytics_db

# API Port
PORT=4000
4. BigQuery Credentials
Place your Google Cloud Service Account JSON key inside the analytics-api folder and name it keys.json. The backend expects this file to authenticate and fetch data from BigQuery.

5. Run the Backend Server
Start the development server:

Bash
npm run start:dev
The API should now be running at http://localhost:4000.
(Note: TypeORM is configured with synchronize: true in development, so the required database tables like daily_analytics and page_mappings will be created automatically when the app starts).

💻 Part 2: Frontend Setup (analytics-dashboard)
The frontend is built with React, Next.js, Tailwind CSS, and uses Axios for API communication.

1. Navigate to the frontend directory
Open a new terminal window and navigate to the frontend folder:

Bash
cd analytics-dashboard
2. Install dependencies
Bash
npm install
3. Environment Variables (Optional)
By default, the frontend API requests point to http://localhost:4000. If you need to change this, you can configure it in the source code or create an .env.local file (if you choose to update src/lib/api.ts to use process.env.NEXT_PUBLIC_API_URL).

4. Run the Frontend Server
Start the Next.js development server:

Bash
npm run dev
The dashboard should now be running at http://localhost:3000.

🛠️ Features & Usage
Dashboard Overview (http://localhost:3000/)

View top-level KPIs (Sessions, Users, Pageviews, Engagement, Recurring Users).

Filter data by Date Range, Presets (Last 7 Days, This Month, etc.), and UTM Campaign.

View daily and weekly traffic trends in the Headlines section.

See detailed page breakdowns in the Traffic Table.

Dynamic Page Mappings (http://localhost:3000/settings)

Click the Settings (Gear) icon on the Traffic Table to access the Mappings page.

Add, edit, or remove UTM to Page Name mappings.

These are saved directly to the PostgreSQL database and update the dashboard in real-time.

Data with unmapped UTM mediums will correctly show up as "Data Leakage" in the Total API Traffic card on the main dashboard.

Data Export

Click the Download icon on the Traffic Table to export the currently filtered data into a .csv file.

📦 Tech Stack
Frontend:

Next.js (React Framework)

Tailwind CSS (Styling)

Lucide React (Icons)

Axios (HTTP Client)

Date-fns (Date Manipulation)

Backend:

NestJS (Node.js Framework)

TypeORM (ORM)

PostgreSQL (Relational Database)

Google Cloud BigQuery API (Data Warehouse)