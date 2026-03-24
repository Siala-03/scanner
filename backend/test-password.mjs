import bcrypt from 'bcryptjs';

const hash = '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';
const commonPasswords = ['password', 'admin', 'superadmin', 'password123', 'admin123', '123456', 'qwerty'];

console.log('Testing common passwords against the hash...\n');

for (const pwd of commonPasswords) {
  const match = bcrypt.compareSync(pwd, hash);
  if (match) {
    console.log(`✓ PASSWORD FOUND: "${pwd}"`);
  } else {
    console.log(`✗ "${pwd}" - no match`);
  }
}
