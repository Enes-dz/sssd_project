import mysql from 'mysql2/promise';
import { config } from '../config';


const pool = mysql.createPool({
  host: config.db_host,
  user: config.db_user,
  password: config.db_password,
  database: config.db_name,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export default pool;