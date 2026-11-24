-- ====================================================================
-- Disaster Relief Resource Allocation System (DRRACS)
-- Database: disaster_relief_db
-- DBMS PBL 9-Entity Relational Schema + Authentication & Web Tracking
-- Tested for MySQL 8.0+
-- Run this script in MySQL Workbench or MySQL Command Line
-- ====================================================================

CREATE DATABASE IF NOT EXISTS disaster_relief_db;
USE disaster_relief_db;

-- 1. Drop existing tables in reverse dependency order
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS Shipment;
DROP TABLE IF EXISTS Allocation;
DROP TABLE IF EXISTS Request_Item;
DROP TABLE IF EXISTS Request;
DROP TABLE IF EXISTS Stock;
DROP TABLE IF EXISTS Shelter;
DROP TABLE IF EXISTS Supply;
DROP TABLE IF EXISTS Location;
DROP TABLE IF EXISTS Disaster_Incident;
DROP TABLE IF EXISTS Users;
DROP TABLE IF EXISTS Activity_Log;
SET FOREIGN_KEY_CHECKS = 1;

-- ====================================================================
-- Table 1: Users (Role-Based Access Control)
-- ====================================================================
CREATE TABLE Users (
    User_Id INT AUTO_INCREMENT PRIMARY KEY,
    Full_Name VARCHAR(100) NOT NULL,
    Email VARCHAR(120) NOT NULL UNIQUE,
    Password_Hash VARCHAR(255) NOT NULL,
    Role ENUM('Admin', 'Relief_Officer', 'Shelter_Manager', 'Citizen') NOT NULL DEFAULT 'Relief_Officer',
    Phone VARCHAR(20),
    Created_At DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ====================================================================
-- Table 2: Disaster_Incident
-- ====================================================================
CREATE TABLE Disaster_Incident (
    Incident_Id INT AUTO_INCREMENT PRIMARY KEY,
    Disaster_Type VARCHAR(60) NOT NULL,
    Name VARCHAR(120) NOT NULL,
    Start_Date DATE NOT NULL,
    Severity ENUM('Low','Medium','High','Critical') NOT NULL DEFAULT 'Medium',
    Status ENUM('Active','Contained','Resolved') NOT NULL DEFAULT 'Active'
) ENGINE=InnoDB;

-- ====================================================================
-- Table 3: Location (Geospatial & Area Metadata)
-- ====================================================================
CREATE TABLE Location (
    Location_Id INT AUTO_INCREMENT PRIMARY KEY,
    Address VARCHAR(200) NOT NULL,
    City VARCHAR(80) NOT NULL,
    State VARCHAR(80) NOT NULL,
    Location_Type ENUM('Affected Area', 'Warehouse/Depot', 'Relief Hub') NOT NULL DEFAULT 'Affected Area',
    Latitude DECIMAL(10, 8) DEFAULT 26.2183,
    Longitude DECIMAL(11, 8) DEFAULT 78.1828,
    Affected_Population INT NOT NULL DEFAULT 0,
    Verification_Status ENUM('Pending','Verified','Rejected') NOT NULL DEFAULT 'Pending',
    CHECK (Affected_Population >= 0)
) ENGINE=InnoDB;

-- ====================================================================
-- Table 4: Supply (Relief Catalog)
-- ====================================================================
CREATE TABLE Supply (
    Supply_Id INT AUTO_INCREMENT PRIMARY KEY,
    Supply_Name VARCHAR(100) NOT NULL,
    Unit VARCHAR(30) NOT NULL,
    Storage_Require VARCHAR(120),
    Category VARCHAR(60) NOT NULL
) ENGINE=InnoDB;

-- ====================================================================
-- Table 5: Shelter (Evacuation & Relief Camps)
-- ====================================================================
CREATE TABLE Shelter (
    Shelter_Id INT AUTO_INCREMENT PRIMARY KEY,
    Shelter_Name VARCHAR(120) NOT NULL,
    Capacity INT NOT NULL,
    Current_Occupancy INT NOT NULL DEFAULT 0,
    Location_Id INT NOT NULL,
    CHECK (Capacity >= 0),
    CHECK (Current_Occupancy >= 0 AND Current_Occupancy <= Capacity),
    CONSTRAINT fk_shelter_location
        FOREIGN KEY (Location_Id) REFERENCES Location(Location_Id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ====================================================================
-- Table 6: Request (Aid Requests from Shelters)
-- ====================================================================
CREATE TABLE Request (
    Request_Id INT AUTO_INCREMENT PRIMARY KEY,
    Incident_Id INT NOT NULL,
    Shelter_Id INT NOT NULL,
    Request_Date DATE NOT NULL,
    Priority ENUM('Low','Medium','High','Urgent') NOT NULL DEFAULT 'Medium',
    Priority_Score DECIMAL(5,2) DEFAULT 50.00,
    Request_Status ENUM('Pending','Approved','Partially Fulfilled','Fulfilled','Rejected') NOT NULL DEFAULT 'Pending',
    CONSTRAINT fk_request_incident
        FOREIGN KEY (Incident_Id) REFERENCES Disaster_Incident(Incident_Id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_request_shelter
        FOREIGN KEY (Shelter_Id) REFERENCES Shelter(Shelter_Id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ====================================================================
-- Table 7: Request_Item (Items Requested & Allocation Progress)
-- ====================================================================
CREATE TABLE Request_Item (
    Reqitem_Id INT AUTO_INCREMENT PRIMARY KEY,
    Request_Id INT NOT NULL,
    Supply_Id INT NOT NULL,
    Item_Type VARCHAR(80) NOT NULL,
    Quantity INT NOT NULL,
    Allocated_Quantity INT NOT NULL DEFAULT 0,
    CHECK (Quantity > 0),
    CHECK (Allocated_Quantity >= 0 AND Allocated_Quantity <= Quantity),
    CONSTRAINT fk_request_item_request
        FOREIGN KEY (Request_Id) REFERENCES Request(Request_Id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_request_item_supply
        FOREIGN KEY (Supply_Id) REFERENCES Supply(Supply_Id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ====================================================================
-- Table 8: Stock (Supplies at Warehouses/Depots)
-- ====================================================================
CREATE TABLE Stock (
    Stock_Id INT AUTO_INCREMENT PRIMARY KEY,
    Supply_Id INT NOT NULL,
    Location_Id INT NOT NULL,
    Quantity INT NOT NULL DEFAULT 0,
    Last_Updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CHECK (Quantity >= 0),
    CONSTRAINT fk_stock_supply
        FOREIGN KEY (Supply_Id) REFERENCES Supply(Supply_Id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_stock_location
        FOREIGN KEY (Location_Id) REFERENCES Location(Location_Id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT uq_stock_supply_location UNIQUE (Supply_Id, Location_Id)
) ENGINE=InnoDB;

-- ====================================================================
-- Table 9: Allocation (Stock Assigned to Request Items)
-- ====================================================================
CREATE TABLE Allocation (
    Alloc_Id INT AUTO_INCREMENT PRIMARY KEY,
    Reqitem_Id INT NOT NULL,
    Stock_Id INT NOT NULL,
    Alloc_Date DATE NOT NULL,
    Allocated_Quantity INT NOT NULL,
    Approved_By INT NULL,
    Allocation_Status ENUM('Approved','Packed','Dispatched','Delivered','Cancelled') NOT NULL DEFAULT 'Approved',
    CHECK (Allocated_Quantity > 0),
    CONSTRAINT fk_allocation_request_item
        FOREIGN KEY (Reqitem_Id) REFERENCES Request_Item(Reqitem_Id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_allocation_stock
        FOREIGN KEY (Stock_Id) REFERENCES Stock(Stock_Id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_allocation_user
        FOREIGN KEY (Approved_By) REFERENCES Users(User_Id)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

-- ====================================================================
-- Table 10: Shipment (Logistics & Secure OTP Delivery)
-- ====================================================================
CREATE TABLE Shipment (
    Ship_Id INT AUTO_INCREMENT PRIMARY KEY,
    Alloc_Id INT NOT NULL,
    Vehicle_Number VARCHAR(40),
    Driver_Name VARCHAR(80),
    Driver_Phone VARCHAR(20),
    Delivery_OTP CHAR(6) DEFAULT '123456',
    Destination_Date DATE,
    Dispatched_Date DATE,
    Expected_Arrival DATE,
    Received_Quantity INT NOT NULL DEFAULT 0,
    Shipment_Status ENUM('Preparing','In Transit','Delivered','Delayed') NOT NULL DEFAULT 'Preparing',
    CHECK (Received_Quantity >= 0),
    CONSTRAINT fk_shipment_allocation
        FOREIGN KEY (Alloc_Id) REFERENCES Allocation(Alloc_Id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ====================================================================
-- Table 11: Activity_Log (Audit Trail for Enterprise Dashboard)
-- ====================================================================
CREATE TABLE Activity_Log (
    Log_Id INT AUTO_INCREMENT PRIMARY KEY,
    Action_Type VARCHAR(50) NOT NULL,
    Description TEXT NOT NULL,
    User_Id INT NULL,
    Created_At DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_log_user
        FOREIGN KEY (User_Id) REFERENCES Users(User_Id)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

-- ====================================================================
-- SAMPLE DATA (Initial Seeds for Testing & Demonstration)
-- ====================================================================

-- 1. Users (Password for all 4 users is: "admin123")
INSERT INTO Users (User_Id, Full_Name, Email, Password_Hash, Role, Phone) VALUES
(1, 'Commander Ananya Sharma', 'admin@drracs.org', '$2b$10$4zaPnlmNGXwJjWXyDE69ZuWsfu7rHEmIhdKrNw3wl0Vt81CmAKJD.', 'Admin', '9876543210'),
(2, 'Relief Officer Vikram Verma', 'officer@drracs.org', '$2b$10$4zaPnlmNGXwJjWXyDE69ZuWsfu7rHEmIhdKrNw3wl0Vt81CmAKJD.', 'Relief_Officer', '9876543211'),
(3, 'Shelter Lead Rajesh Patel', 'shelter@drracs.org', '$2b$10$4zaPnlmNGXwJjWXyDE69ZuWsfu7rHEmIhdKrNw3wl0Vt81CmAKJD.', 'Shelter_Manager', '9876543212'),
(4, 'Citizen Ground Reporter', 'citizen@drracs.org', '$2b$10$4zaPnlmNGXwJjWXyDE69ZuWsfu7rHEmIhdKrNw3wl0Vt81CmAKJD.', 'Citizen', '9876543299');

-- 2. Disasters
INSERT INTO Disaster_Incident (Incident_Id, Disaster_Type, Name, Start_Date, Severity, Status) VALUES
(1, 'Flood', 'Gwalior Flood Response', '2026-10-18', 'High', 'Active'),
(2, 'Earthquake', 'Sehore Seismic Event', '2026-10-12', 'Medium', 'Contained'),
(3, 'Industrial Fire', 'Indore Hub Fire Incident', '2026-10-20', 'Critical', 'Active');

-- 3. Locations (Coordinates in Madhya Pradesh)
INSERT INTO Location (Location_Id, Address, City, State, Location_Type, Latitude, Longitude, Affected_Population, Verification_Status) VALUES
(1, 'Near Morar River Embankment', 'Gwalior', 'Madhya Pradesh', 'Affected Area', 26.2234, 78.2270, 1200, 'Verified'),
(2, 'Main Market Relief Sector', 'Sehore', 'Madhya Pradesh', 'Affected Area', 23.2032, 77.0844, 450, 'Verified'),
(3, 'Industrial Zone Sector 2 Depot', 'Indore', 'Madhya Pradesh', 'Warehouse/Depot', 22.7196, 75.8577, 800, 'Verified'),
(4, 'Community Hall Disaster Hub', 'Gwalior', 'Madhya Pradesh', 'Relief Hub', 26.2050, 78.1900, 300, 'Pending'),
(5, 'Central Logistics Base', 'Bhopal', 'Madhya Pradesh', 'Warehouse/Depot', 23.2599, 77.4126, 0, 'Verified');

-- 4. Supplies Catalog
INSERT INTO Supply (Supply_Id, Supply_Name, Unit, Storage_Require, Category) VALUES
(1, 'Packaged Drinking Water (20L)', 'bottles', 'Cool, clean storage', 'Water'),
(2, 'Emergency Food Packets', 'packets', 'Dry storage', 'Food'),
(3, 'Thermal Blankets', 'pieces', 'Dry storage', 'Clothing'),
(4, 'Trauma & First Aid Kits', 'kits', 'Dry, temperature-controlled', 'Medical'),
(5, 'ORS Electrolyte Sachets', 'sachets', 'Cool, dry storage', 'Medical'),
(6, 'Emergency Relief Tents', 'units', 'Heavy dry storage', 'Shelter');

-- 5. Shelters
INSERT INTO Shelter (Shelter_Id, Shelter_Name, Capacity, Current_Occupancy, Location_Id) VALUES
(1, 'Central Emergency Shelter', 500, 320, 1),
(2, 'City Model School Shelter', 250, 180, 2),
(3, 'Community Hall Shelter', 200, 90, 4);

-- 6. Requests
INSERT INTO Request (Request_Id, Incident_Id, Shelter_Id, Request_Date, Priority, Priority_Score, Request_Status) VALUES
(1, 1, 1, '2026-10-19', 'Urgent', 92.50, 'Partially Fulfilled'),
(2, 2, 2, '2026-10-13', 'High', 75.00, 'Approved'),
(3, 1, 3, '2026-10-21', 'Medium', 45.00, 'Pending'),
(4, 3, 1, '2026-10-21', 'Urgent', 88.00, 'Pending');

-- 7. Request Items
INSERT INTO Request_Item (Reqitem_Id, Request_Id, Supply_Id, Item_Type, Quantity, Allocated_Quantity) VALUES
(1, 1, 1, 'Drinking Water', 400, 300),
(2, 1, 2, 'Food Packets', 250, 150),
(3, 2, 3, 'Blankets', 120, 80),
(4, 2, 4, 'First Aid Kits', 30, 0),
(5, 3, 1, 'Drinking Water', 150, 0),
(6, 4, 4, 'First Aid Kits', 60, 0);

-- 8. Stock (Warehouse & Depot Inventories)
INSERT INTO Stock (Stock_Id, Supply_Id, Location_Id, Quantity) VALUES
(1, 1, 3, 1200),
(2, 2, 3, 850),
(3, 3, 5, 500),
(4, 4, 3, 150),
(5, 5, 3, 400),
(6, 1, 5, 2000),
(7, 6, 5, 100);

-- 9. Allocations
INSERT INTO Allocation (Alloc_Id, Reqitem_Id, Stock_Id, Alloc_Date, Allocated_Quantity, Approved_By, Allocation_Status) VALUES
(1, 1, 1, '2026-10-19', 300, 1, 'Dispatched'),
(2, 2, 2, '2026-10-19', 150, 1, 'Delivered'),
(3, 3, 3, '2026-10-14', 80, 2, 'Approved');

-- 10. Shipments (with Delivery OTP)
INSERT INTO Shipment (Ship_Id, Alloc_Id, Vehicle_Number, Driver_Name, Driver_Phone, Delivery_OTP, Destination_Date, Dispatched_Date, Expected_Arrival, Received_Quantity, Shipment_Status) VALUES
(1, 1, 'MP-07-GA-1234', 'Ramesh Kumar', '9811122233', '482910', '2026-10-20', '2026-10-19', '2026-10-20', 280, 'In Transit'),
(2, 2, 'MP-09-BC-5678', 'Sunil Yadav', '9844455566', '193847', '2026-10-20', '2026-10-19', '2026-10-20', 150, 'Delivered'),
(3, 3, 'MP-04-EF-9012', 'Vikram Singh', '9877788899', '582014', '2026-10-15', NULL, '2026-10-16', 0, 'Preparing');

-- 11. Initial Activity Logs
INSERT INTO Activity_Log (Log_Id, Action_Type, Description, User_Id) VALUES
(1, 'DISASTER_DECLARED', 'Gwalior Flood Response initialized with High severity.', 1),
(2, 'STOCK_RECEIVED', 'Received 1200 units of Drinking Water at Indore Depot.', 2),
(3, 'ALLOCATION_APPROVED', 'Allocated 300 bottles of Drinking Water for Central Emergency Shelter.', 1),
(4, 'SHIPMENT_DISPATCHED', 'Shipment #1 dispatched via vehicle MP-07-GA-1234. Tracking OTP generated.', 2);

