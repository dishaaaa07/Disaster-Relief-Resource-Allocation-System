const db = require('../config/db');

async function migrateCitizenRole() {
  try {
    const [columns] = await db.query(
      `SELECT COLUMN_TYPE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'Users'
         AND COLUMN_NAME = 'Role'`
    );

    if (columns.length === 0) {
      throw new Error('Users.Role was not found. Initialize the database before migrating.');
    }

    const columnType = columns[0].COLUMN_TYPE;
    if (columnType.includes("'Citizen'")) {
      console.log('Users.Role already supports Citizen; no migration needed.');
      return;
    }

    if (columnType !== "enum('Admin','Relief_Officer','Shelter_Manager')") {
      throw new Error(`Unexpected Users.Role definition: ${columnType}`);
    }

    await db.query(
      `ALTER TABLE Users
       MODIFY COLUMN Role ENUM('Admin', 'Relief_Officer', 'Shelter_Manager', 'Citizen')
       NOT NULL DEFAULT 'Relief_Officer'`
    );
    console.log('Users.Role now supports Citizen. Existing accounts were preserved.');
  } finally {
    await db.end();
  }
}

migrateCitizenRole().catch(error => {
  console.error('Citizen role migration failed:', error.message);
  process.exitCode = 1;
});
