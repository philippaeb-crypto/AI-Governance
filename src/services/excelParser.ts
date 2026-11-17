import * as XLSX from 'xlsx';

export interface ParsedWorkbook {
  fileName: string;
  sheetNames: string[];
  workbook: XLSX.WorkBook;
}

export interface ParsedWorksheetData {
  sheetName: string;
  headers: string[];
  rows: Record<string, unknown>[];
}

/**
 * Parses XLSX/XLS/CSV strictly in local browser memory.
 * Never transmits file contents to external services.
 */
export async function parseLocalSpreadsheetFile(
  file: File
): Promise<ParsedWorkbook> {
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
    throw new Error(
      `Unsupported file format "${file.name}". Please upload an .xlsx, .xls, or .csv spreadsheet.`
    );
  }
  if (file.size === 0) {
    throw new Error(`The uploaded file "${file.name}" is empty (0 bytes).`);
  }
  const buffer = await file.arrayBuffer();
  const workbook = /\.csv$/i.test(file.name)
    ? XLSX.read(
        new TextDecoder('utf-8').decode(buffer).replace(/^\uFEFF/, ''),
        { type: 'string', raw: true }
      )
    : XLSX.read(buffer, { type: 'array' });
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error(`No readable worksheets found inside "${file.name}".`);
  }
  return {
    fileName: file.name,
    sheetNames: workbook.SheetNames,
    workbook,
  };
}

export function extractWorksheetRows(
  workbook: XLSX.WorkBook,
  sheetName: string
): ParsedWorksheetData {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return { sheetName, headers: [], rows: [] };
  }
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });
  if (matrix.length === 0) {
    return { sheetName, headers: [], rows: [] };
  }

  const rawHeaders = (matrix[0] ?? []).map((h, i) => {
    const trimmed = String(h ?? '').trim();
    return trimmed || `Column_${i + 1}`;
  });

  const rows: Record<string, unknown>[] = [];
  for (let r = 1; r < matrix.length; r += 1) {
    const arr = matrix[r] ?? [];
    const hasValue = arr.some((cell) => String(cell ?? '').trim() !== '');
    if (!hasValue) continue;
    const obj: Record<string, unknown> = {};
    for (let c = 0; c < rawHeaders.length; c += 1) {
      obj[rawHeaders[c]] = arr[c] ?? '';
    }
    rows.push(obj);
  }

  return {
    sheetName,
    headers: rawHeaders,
    rows,
  };
}

export function triggerCsvDownload(fileName: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadSampleInitiativesWorkbook(): void {
  const rows = [
    {
      'SharePoint Item ID': 'SP-901',
      'Solution / Use Case Name': 'Treasury FX Hedging Briefing Agent',
      'Business Problem':
        'Treasury analysts manually aggregate daily FX exposure deltas across 4 ERP ledgers before morning briefings.',
      'Short Description':
        'Copilot Studio agent summarizing daily FX positions and hedge coverage exceptions.',
      'Business Capability': 'Treasury & Liquidity Risk',
      'Business Area / Department': 'Finance & Controlling',
      'Accountable Owner': 'Sarah Chen',
      'AI Platform': 'Microsoft Copilot Studio',
      'Solution Type': 'Enterprise Copilot Extension',
      'AI Type': 'Agentic / Multi-Step Workflow',
      Category: 'AI Agent',
      'Lifecycle Status': 'Pilot',
      'Value Measurement Category': 'Efficiency Savings',
      Users: 10,
      'Minutes Saved per Occurrence': 25,
      'Process Frequency per Week': 5,
      'Hourly Rate': 70,
      'Created Date': '2026-08-10',
      'Last Modified Date': '2026-10-20',
      'Go-Live Date': '2026-10-20',
    },
    {
      'SharePoint Item ID': 'SP-902',
      'Solution / Use Case Name': 'Freight Claims Dispute Draft Assistant',
      'Business Problem':
        'Logistics coordinators spend 3 hours per claim assembling carrier SLA evidence and drafting formal claim notices.',
      'Short Description':
        'Automated workflow generating structured freight claim packets from WMS scan logs.',
      'Business Capability': 'Logistics & Carrier Claims',
      'Business Area / Department': 'Operations & Supply Chain',
      'Accountable Owner': 'Marcus Weber',
      'AI Platform': 'Power Automate AI Builder',
      'Solution Type': 'Automated Workflow / RPA + AI',
      'AI Type': 'Generative AI / LLM',
      Category: 'AI Automation',
      'Lifecycle Status': 'Assessment',
      'Value Measurement Category': 'Efficiency Savings',
      Users: 16,
      'Minutes Saved per Occurrence': 30,
      'Process Frequency per Week': 4,
      'Hourly Rate': 52,
      'Created Date': '2026-10-02',
      'Last Modified Date': '2026-11-04',
      'Go-Live Date': '',
    },
    {
      'SharePoint Item ID': 'SP-903',
      'Solution / Use Case Name': 'Quality SOP Deviation Summarizer',
      'Business Problem':
        'QA engineers review lengthy batch deviation reports manually across regional manufacturing sites.',
      'Short Description':
        'Azure OpenAI summarization pipeline highlighting recurring root-cause patterns in CAPA logs.',
      'Business Capability': 'Quality Assurance & CAPA',
      'Business Area / Department': 'Operations & Supply Chain',
      'Accountable Owner': 'Marcus Weber',
      'AI Platform': 'Azure OpenAI Service',
      'Solution Type': 'Custom Developed Application',
      'AI Type': 'Generative AI / LLM',
      Category: 'AI Solution',
      'Lifecycle Status': 'Production',
      'Value Measurement Category': 'Quality Improvements',
      Users: 28,
      'Minutes Saved per Occurrence': '15,5',
      'Process Frequency per Week': 6,
      'Hourly Rate': '',
      'Created Date': '12.05.2026',
      'Last Modified Date': '01.11.2026',
      'Go-Live Date': '18.08.2026',
    },
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'AI_Registry_Export');
  XLSX.writeFile(wb, 'aas_sample_initiatives_export.xlsx');
}

export function downloadSampleCostsWorkbook(): void {
  const rows = [
    {
      Department: 'Finance & Controlling',
      'Cost Center': 'CC-1040',
      Period: '2026-11',
      Platform: 'Microsoft Copilot Studio',
      'Cost Category': 'Platform Licensing',
      'Spend Type': 'Actual',
      'Amount EUR': 2450,
      Tokens: 4200000,
      Note: 'Monthly Copilot Studio tenant allocation',
    },
    {
      Department: 'Operations & Supply Chain',
      'Cost Center': 'CC-2010',
      Period: '2026-11',
      Platform: 'Azure OpenAI Service',
      'Cost Category': 'LLM Tokens / API Consumption',
      'Spend Type': 'Actual',
      'Amount EUR': 1890,
      Tokens: 18500000,
      Note: 'GPT-4o logistics disruption feed processing',
    },
    {
      Department: 'Operations & Supply Chain',
      'Cost Center': 'CC-2010',
      Period: '2026-11',
      Platform: 'Azure OpenAI Service',
      'Cost Category': 'LLM Tokens / API Consumption',
      'Spend Type': 'Planned',
      'Amount EUR': 2100,
      Tokens: 20000000,
      Note: 'Q4 budget baseline',
    },
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Monthly_AI_Costs');
  XLSX.writeFile(wb, 'aas_sample_ai_costs.xlsx');
}

export function downloadSampleCostPlanWorkbook(): void {
  const rows = [
    {
      Department: 'Analytics',
      'Planning Year': 2026,
      Month: 10,
      'AI Platform': 'Azure OpenAI Service',
      'Cost Category': 'LLM Tokens / API Consumption',
      'Planned Cost (EUR)': 2500,
      'Forecast Cost (EUR)': 2350,
      'Cost Center': 'CC-2400',
      'License Count': 18,
      Comments: 'Q4 production NL2SQL capacity baseline',
    },
    {
      Department: 'Engineering',
      'Planning Year': 2026,
      Month: 'November',
      'AI Platform': 'Azure OpenAI Service',
      'Cost Category': 'LLM Tokens / API Consumption',
      'Planned Cost (EUR)': '3.250,50',
      'Forecast Cost (EUR)': '3.100,00',
      'Cost Center': 'CC-2100',
      'License Count': 34,
      Comments: 'German decimal format example (BOM verification ramp)',
    },
    {
      Department: 'Procurement',
      'Planning Year': 2026,
      Month: 12,
      'AI Platform': 'Power Automate AI Builder',
      'Cost Category': 'Platform Licensing',
      'Planned Cost (EUR)': '1,850.00',
      'Forecast Cost (EUR)': '1,790.00',
      'Cost Center': 'CC-2200',
      'License Count': 24,
      Comments: 'English decimal format example (December license renewal)',
    },
    {
      Department: 'Site Service',
      'Planning Year': 2026,
      Month: 'Dezember',
      'AI Platform': 'Microsoft Copilot Studio',
      'Cost Category': 'Platform Licensing',
      'Planned Cost (EUR)': 2400,
      'Forecast Cost (EUR)': '',
      'Cost Center': 'CC-2300',
      'License Count': 40,
      Comments: 'Blank forecast preserved as Missing Forecast',
    },
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'AI_Cost_Plan_2026');
  XLSX.writeFile(wb, 'aas_sample_ai_cost_plan_2026.xlsx');
}

