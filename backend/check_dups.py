from accounting.models_voucher_payment import PaymentVoucher
dups = PaymentVoucher.objects.filter(voucher_number='cd000145').order_by('id')
with open('voucher_dups_check.txt', 'w') as f:
    for v in dups:
        f.write(f"ID: {v.id}, Date: {v.date}, Amount: {v.total_amount}\n")
print(f"Done, {len(dups)} checked.")
