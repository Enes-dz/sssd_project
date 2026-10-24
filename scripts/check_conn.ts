import pool from '../src/dao/db';
import { config } from '../src/config';

async function checkConnection() {
  console.log(config)
  try {
    // Attempt to get a connection from the pool
    const connection = await pool.getConnection();
    
    console.log('✅ Database connection successful!');
    
    // Release the connection back to the pool immediately
    connection.release();
  } catch (error) {
    console.error('❌ Database connection failed:');
    
    // Narrowing down the error for better debugging
    if (error instanceof Error) {
      console.error('Message:', error.message);
    }
  }
}

checkConnection();