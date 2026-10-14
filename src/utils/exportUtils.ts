/**
 * Utility to export data to CSV (compatible with Excel)
 */
export const exportToCSV = (filename: string, headers: string[], data: any[][]) => {
    // Add BOM for Excel to recognize UTF-8
    const BOM = '\uFEFF';
    
    const csvContent = data.map(row => 
        row.map(cell => {
            // Escape double quotes and wrap in double quotes if it contains comma or newline
            const cellValue = String(cell || '').replace(/"/g, '""');
            return cellValue.includes(',') || cellValue.includes('\n') || cellValue.includes('"') 
                ? `"${cellValue}"` 
                : cellValue;
        }).join(',')
    ).join('\n');

    const fullContent = BOM + headers.join(',') + '\n' + csvContent;
    const blob = new Blob([fullContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
