const fs = require('fs');
const code = fs.readFileSync('c:/108/AI-accounting-0.03/frontend/src/pages/Vouchers/ReceiptVoucher.tsx', 'utf8');
let stack = [];
let lines = code.split('\n');
for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    for (let j = 0; j < line.length; j++) {
        let c = line[j];
        if (c === '{' || c === '(' || c === '[') stack.push({line: i+1, char: j+1, c: c});
        if (c === '}' || c === ')' || c === ']') {
            if (stack.length === 0) {
                console.log(`Unmatched ${c} at line ${i+1}, char ${j+1}`);
            } else {
                let last = stack.pop();
                if ((c === '}' && last.c !== '{') || (c === ')' && last.c !== '(') || (c === ']' && last.c !== '[')) {
                    console.log(`Mismatched ${c} at line ${i+1}, char ${j+1} (matches ${last.c} at line ${last.line})`);
                }
            }
        }
    }
}
if (stack.length > 0) {
    stack.forEach(s => console.log(`Unclosed ${s.c} at line ${s.line}, char ${s.char}`));
} else {
    console.log('All delimiters are balanced.');
}
