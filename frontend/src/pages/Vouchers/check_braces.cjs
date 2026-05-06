const fs = require('fs');
const code = fs.readFileSync('c:/108/AI-accounting-0.03/frontend/src/pages/Vouchers/PaymentVoucherSingle.tsx', 'utf8');
let stack = [];
let lines = code.split('\n');
for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    for (let j = 0; j < line.length; j++) {
        if (line[j] === '{') stack.push({line: i+1, char: j+1});
        if (line[j] === '}') {
            if (stack.length === 0) {
                console.log(`Unmatched } at line ${i+1}, char ${j+1}`);
            } else {
                stack.pop();
            }
        }
    }
}
if (stack.length > 0) {
    stack.forEach(s => console.log(`Unclosed { at line ${s.line}, char ${s.char}`));
} else {
    console.log('Braces are balanced.');
}
