const bcrypt = require('bcryptjs');
const passwords = ['ServvAdmin1!','ServvAdmin2!','ServvAdmin3!'];
(async ()=>{
  for (const p of passwords) {
    const h = await bcrypt.hash(p, 10);
    console.log(`${p} ${h}`);
  }
})();
