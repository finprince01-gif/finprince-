export const getXLSX = async () => {
    const XLSX = await import('xlsx');
    return XLSX;
};
