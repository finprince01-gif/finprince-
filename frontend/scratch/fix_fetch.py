import re

with open("src/components/AddNewCustomerModal.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# 1. Add mockBranches definition if not exists
mock_branches_code = """
    // Mock Branch Data
    const mockBranches = [
        { id: 1, gstin: '29ABCDE1234F1Z5', address: '123, Industrial Area, Bangalore, Karnataka - 560001', defaultRef: 'Bangalore Branch' },
        { id: 2, gstin: '27ABCDE1234F1Z5', address: '456, Textile Market, Surat, Gujarat - 395002', defaultRef: 'Mumbai Branch' },
        { id: 3, gstin: '07ABCDE1234F1Z5', address: '789, Connaught Place, New Delhi - 110001', defaultRef: 'Main Branch' },
    ];
"""
if "const mockBranches =" not in code:
    code = code.replace("const mockGSTINs = ['29ABCDE1234F1Z5', '27ABCDE1234F1Z5', '07ABCDE1234F1Z5'];", 
                        "const mockGSTINs = ['29ABCDE1234F1Z5', '27ABCDE1234F1Z5', '07ABCDE1234F1Z5'];\n" + mock_branches_code)

# 2. Add initializeRegisteredBranch if not exists
init_reg_code = """
    const initializeRegisteredBranch = (gstin: string) => {
        setRegisteredBranches(prev => {
            if (!prev.find(b => b.gstin === gstin)) {
                return [...prev, {
                    gstin: gstin,
                    defaultRef: '', addressLine1: '', addressLine2: '', addressLine3: '', city: '', pincode: '', state: '', country: 'India', contactPerson: '', contactNumber: '', email: ''
                }];
            }
            return prev;
        });
    };
"""
if "const initializeRegisteredBranch =" not in code:
    code = code.replace("const handleGstSelect = (gstin: string) => {", init_reg_code + "\n    const handleGstSelect = (gstin: string) => {")

# 3. Update handleGstSelect
old_handle_gst = """    const handleGstSelect = (gstin: string) => {
        if (!selectedGSTINs.includes(gstin)) {
            setSelectedGSTINs(prev => [...prev, gstin]);
        }
        setGstInput('');
        setShowGstDropdown(false);
    };"""

new_handle_gst = """    const handleGstSelect = (gstin: string) => {
        setShowBranchDetails(false); // Hide details when selection changes, forcing user to click Fetch again
        if (selectedGSTINs.includes(gstin)) {
            setSelectedGSTINs(prev => prev.filter(g => g !== gstin));
            setRegisteredBranches(prev => prev.filter(b => b.gstin !== gstin)); // Cleanup
        } else {
            setSelectedGSTINs(prev => [...prev, gstin]);
            setGstInput(''); // Clear input on selection
            initializeRegisteredBranch(gstin); // Initialize data
        }
        setShowGstDropdown(false);
    };"""
code = code.replace(old_handle_gst, new_handle_gst)

# 4. Update handleFetchBranchDetails
old_fetch = """    const handleFetchBranchDetails = () => {
        if (selectedGSTINs.length > 0) {
            // Initialize any new GSTINs
            setRegisteredBranches(prev => {
                const existing = prev.map(b => b.gstin);
                const newOnes = selectedGSTINs
                    .filter(g => !existing.includes(g))
                    .map(g => ({ gstin: g, defaultRef: '', addressLine1: '', addressLine2: '', addressLine3: '', city: '', pincode: '', state: '', country: 'India', contactPerson: '', contactNumber: '', email: '' }));
                return [...prev.filter(b => selectedGSTINs.includes(b.gstin)), ...newOnes];
            });
            setShowBranchDetails(true);
            setExpandedBranches(selectedGSTINs.map((_, i) => i + 1));
        }
    };"""

new_fetch = """    const handleFetchBranchDetails = () => {
        let currentGstins = [...selectedGSTINs];
        const newGstInput = gstInput.trim().toUpperCase();

        if (newGstInput && !currentGstins.includes(newGstInput)) {
            currentGstins.push(newGstInput);
            setSelectedGSTINs(currentGstins);
            setGstInput('');
            initializeRegisteredBranch(newGstInput);
        }

        if (currentGstins.length > 0) {
            setLoadingGstFetch(true);
            setTimeout(() => {
                setRegisteredBranches(prev => {
                    // Ensure the new input is in prev if initializeRegisteredBranch hasn't fully propagated yet
                    let updatedBranches = [...prev];
                    if (newGstInput && !updatedBranches.find(b => b.gstin === newGstInput)) {
                        const mock = mockBranches.find(b => b.gstin === newGstInput);
                        updatedBranches.push({
                            gstin: newGstInput,
                            defaultRef: mock ? mock.defaultRef : '',
                            addressLine1: '', addressLine2: '', addressLine3: '', city: '', pincode: '', state: '', country: 'India', contactPerson: '', contactNumber: '', email: ''
                        });
                    }

                    return updatedBranches.map(branch => {
                        if (currentGstins.includes(branch.gstin)) {
                            return {
                                ...branch,
                                legalName: branch.legalName || 'Mock Legal Name Ltd',
                                tradeName: branch.tradeName || 'Mock Trade Name Ltd',
                                registrationType: branch.registrationType || 'Regular',
                                addressLine1: branch.addressLine1 || '123, Business Park',
                                addressLine2: branch.addressLine2 || 'Tech City',
                                addressLine3: branch.addressLine3 || 'India',
                                city: branch.city || 'Tech City',
                                state: branch.state || 'Tamil Nadu',
                                country: branch.country || 'India',
                                pincode: branch.pincode || '600001',
                                contactPerson: branch.contactPerson || 'John Doe',
                                contactNumber: branch.contactNumber || '9876543210',
                                email: branch.email || 'john@example.com',
                                defaultRef: branch.defaultRef || 'Main Branch'
                            };
                        }
                        return branch;
                    });
                });
                setLoadingGstFetch(false);
                setShowBranchDetails(true);
                setExpandedBranches(currentGstins.map((_, i) => i + 1));
            }, 500); // Simulate network latency
        }
    };"""
code = code.replace(old_fetch, new_fetch)

with open("src/components/AddNewCustomerModal.tsx", "w", encoding="utf-8") as f:
    f.write(code)

print("Done")
