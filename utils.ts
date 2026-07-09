import { Medicine } from "./types";
import { translations, Language } from "./translations";






function getEndOfExpiryDate(dateStr: string): Date {
  const parts = dateStr.split('-');
  if (parts.length === 2) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    // last day of the month
    return new Date(year, month, 0, 23, 59, 59, 999);
  }
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function isExpired(dateStr: string): boolean {
  if (!dateStr) return false;
  const expiryDate = getEndOfExpiryDate(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return expiryDate < today;
}

export function isExpiringWithinSixMonths(dateStr: string): boolean {
  if (!dateStr) return false;
  const expiryDate = getEndOfExpiryDate(dateStr);
  
  const sixMonthsLater = new Date();
  sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
  sixMonthsLater.setHours(23, 59, 59, 999);
  
  return expiryDate <= sixMonthsLater;
}

export function getStatus(
  dateStr: string,
): "expired" | "very_soon" | "soon" | "safe" {
  if (!dateStr) return "safe";

  const expiryDate = getEndOfExpiryDate(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (expiryDate < today) return "expired";

  const threeMonthsLater = new Date();
  threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
  threeMonthsLater.setHours(23, 59, 59, 999);

  if (expiryDate <= threeMonthsLater) return "very_soon";

  const sixMonthsLater = new Date();
  sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
  sixMonthsLater.setHours(23, 59, 59, 999);

  if (expiryDate <= sixMonthsLater) return "soon";

  return "safe";
}


import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export async function exportToPDF(
  medicines: Medicine[],
  projectName: string | null = null,
  employeeName: string | null = null,
  lang: Language = "ar",
  reportLogo: string | null = null
): Promise<boolean> {
  if (medicines.length === 0) return false;

  const t = translations[lang];

  const grouped: Record<string, Record<string, number>> = {};
  medicines.forEach((m) => {
    const name = m.name || "";
    if (!grouped[name]) grouped[name] = {};
    if (m.expiryDates.length === 0) {
      grouped[name][t.csvNoDate] = (grouped[name][t.csvNoDate] || 0) + 1;
    } else {
      m.expiryDates.forEach((d) => {
        grouped[name][d] = (grouped[name][d] || 0) + 1;
      });
    }
  });

  const allGrouped = Object.keys(grouped).map((name) => {
    const datesObj = grouped[name];
    const dates = Object.keys(datesObj).map((date) => ({
      date,
      count: datesObj[date],
    }));
    dates.sort((a, b) => {
      if (a.date === t.csvNoDate) return 1;
      if (b.date === t.csvNoDate) return -1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
    return { name, dates };
  });

  allGrouped.sort((a, b) => {
    const aDateStr = a.dates[0]?.date;
    const bDateStr = b.dates[0]?.date;
    
    if (aDateStr === t.csvNoDate && bDateStr !== t.csvNoDate) return 1;
    if (bDateStr === t.csvNoDate && aDateStr !== t.csvNoDate) return -1;
    if (aDateStr === t.csvNoDate && bDateStr === t.csvNoDate) return 0;
    
    const aTime = new Date(aDateStr).getTime();
    const bTime = new Date(bDateStr).getTime();
    
    if (isNaN(aTime) && isNaN(bTime)) return 0;
    if (isNaN(aTime)) return 1;
    if (isNaN(bTime)) return -1;
    
    return aTime - bTime;
  });

  const PAGE_WIDTH = 800;
  const PAGE_MAX_HEIGHT = 1100; // slightly less than 1131 to allow margin

  function createPage() {
    const container = document.createElement("div");
    container.style.width = PAGE_WIDTH + "px";
    container.style.padding = "40px";
    container.style.backgroundColor = "#ffffff";
    container.style.color = "#37352f";
    container.style.fontFamily = "Inter, ui-sans-serif, system-ui, sans-serif";
    container.style.position = "absolute";
    container.style.left = "0";
    container.style.zIndex = "-9999";
    container.style.top = "0";
    container.dir = lang === "ar" ? "rtl" : "ltr";

    const headerDiv = document.createElement("div");
    headerDiv.style.display = "flex";
    headerDiv.style.alignItems = "center";
    headerDiv.style.justifyContent = "space-between";
    headerDiv.style.marginBottom = "32px";
    headerDiv.style.borderBottom = "2px solid #e9e9e7";
    headerDiv.style.paddingBottom = "16px";

    const iconAndTitle = document.createElement("div");
    iconAndTitle.style.display = "flex";
    iconAndTitle.style.alignItems = "center";
    iconAndTitle.style.gap = "12px";

    const titleIcon = document.createElement("div");
    titleIcon.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" style="color: #0e9594;"><circle cx="12" cy="12" r="4"></circle></svg>`;

    const titleContainer = document.createElement("div");

    const title = document.createElement("h1");
    title.innerText = projectName ? projectName : t.appSubtitle;
    title.style.margin = "0";
    title.style.color = "#37352f";
    title.style.fontSize = "28px";
    title.style.fontWeight = "700";
    titleContainer.appendChild(title);

    iconAndTitle.appendChild(titleIcon);
    iconAndTitle.appendChild(titleContainer);
    headerDiv.appendChild(iconAndTitle);

    if (reportLogo) {
      const logoImg = document.createElement("img");
      logoImg.src = reportLogo;
      logoImg.style.maxHeight = "60px";
      logoImg.style.maxWidth = "200px";
      logoImg.style.objectFit = "contain";
      headerDiv.appendChild(logoImg);
    }

    container.appendChild(headerDiv);

    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";
    table.style.tableLayout = "fixed";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    const headers = [
      {
        text: t.csvMedicineName,
        icon: '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>',
        width: "50%",
      },
      {
        text: t.csvExpiryDate,
        icon: '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>',
        width: "20%",
      },
      {
        text: t.csvStatus,
        icon: '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
        width: "30%",
      },
    ];

    headers.forEach((header, index) => {
      const th = document.createElement("th");
      th.innerHTML = `<div style="display: flex; align-items: center; gap: 6px; color: rgba(55, 53, 47, 0.65); font-size: 14px; font-weight: normal;">${header.icon}<span>${header.text}</span></div>`;
      th.style.borderBottom = "1px solid #e9e9e7";
      th.style.padding = "8px 12px";
      th.style.textAlign = lang === "ar" ? "right" : "left";
      th.style.width = header.width;
      if (index < headers.length - 1) {
        th.style.borderRight = "1px solid #e9e9e7";
      }
      headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    table.appendChild(tbody);
    container.appendChild(table);

    document.body.appendChild(container);

    return { container, tbody, table };
  }

  const pages: HTMLDivElement[] = [];
  let currentPage = createPage();

  allGrouped.forEach((item) => {
    const tr = document.createElement("tr");

    const statusBgAndColor = item.dates.map((d) => {
      let statusText = t.csvSafe;
      let badgeBg = "#94D2BD";
      let badgeColor = "#0f3d2f";
      const status = getStatus(d.date);

      if (status === "expired") {
        statusText = t.csvExpired;
        badgeBg = "#ffe2dd";
        badgeColor = "#d44c47";
      } else if (status === "very_soon") {
        statusText = t.csvVerySoon;
        badgeBg = "#fadec9";
        badgeColor = "#cc4e00"; 
      } else if (status === "soon") {
        statusText = t.csvExpiringSoon;
        badgeBg = "#fdecc8";
        badgeColor = "#402c1b"; 
      }
      return { statusText, badgeBg, badgeColor, date: d.date, count: d.count };
    });

    const dateCol = statusBgAndColor
      .map((d) => {
        const dateStr = d.count > 1 ? `${d.date} (${d.count})` : d.date;
        return `<div style="padding: 4px 0;"><span style="color: ${d.badgeColor}; font-weight: 500;">${dateStr}</span></div>`;
      })
      .join("");

    const statusCol = statusBgAndColor
      .map((d) => {
        return `<div style="padding: 4px 0;"><span style="background-color: ${d.badgeBg}; color: ${d.badgeColor}; padding: 2px 6px; border-radius: 3px; font-size: 14px; line-height: 120%; display: inline-flex; align-items: center; white-space: nowrap;">${d.statusText}</span></div>`;
      })
      .join("");

    const medIcon = `<div style="width: 6px; height: 6px; border-radius: 50%; background-color: #37352f; flex-shrink: 0; margin-top: 8px;"></div>`;

    const cols = [
      `<div style="display: flex; align-items: flex-start; gap: 8px; font-weight: 500; color: #37352f; font-size: 14px; padding: 4px 0;">${medIcon}<span>${item.name}</span></div>`,
      `<div style="color: #37352f; font-size: 14px; display: flex; flex-direction: column; justify-content: flex-start;">${dateCol}</div>`,
      `<div style="display: flex; flex-direction: column; justify-content: flex-start;">${statusCol}</div>`,
    ];

    cols.forEach((colHtml, i) => {
      const td = document.createElement("td");
      td.innerHTML = colHtml;
      td.style.padding = "8px 12px";
      td.style.borderBottom = "1px solid #e9e9e7";
      td.style.verticalAlign = "top";
      if (i < cols.length - 1) {
        td.style.borderRight = "1px solid #e9e9e7";
      }
      tr.appendChild(td);
    });

    currentPage.tbody.appendChild(tr);

    // Check if it exceeded page height
    if (currentPage.container.offsetHeight > PAGE_MAX_HEIGHT) {
      currentPage.tbody.removeChild(tr);
      pages.push(currentPage.container);
      currentPage = createPage();
      currentPage.tbody.appendChild(tr);
    }
  });

  if (employeeName) {
    const signatureDiv = document.createElement("div");
    signatureDiv.style.marginTop = "40px";
    signatureDiv.style.display = "flex";
    signatureDiv.style.justifyContent = lang === "ar" ? "flex-end" : "flex-end";
    signatureDiv.style.padding = "0 20px";
    signatureDiv.innerHTML = `
      <div style="text-align: center;">
        <p style="font-size: 14px; font-weight: 600; color: #37352f; margin-bottom: 8px;">Check by</p>
        <div style="border-bottom: 1px solid #37352f; width: 200px; margin: 0 auto 8px auto;"></div>
        <p style="font-size: 16px; font-weight: bold; color: #37352f; margin: 0;">${employeeName}</p>
      </div>
    `;

    currentPage.container.appendChild(signatureDiv);

    if (currentPage.container.offsetHeight > PAGE_MAX_HEIGHT) {
       currentPage.container.removeChild(signatureDiv);
       pages.push(currentPage.container);
       currentPage = createPage();
       currentPage.container.appendChild(signatureDiv);
    }
  }

  pages.push(currentPage.container);

  try {
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    for (let i = 0; i < pages.length; i++) {
      const pageContainer = pages[i];
      const canvas = await html2canvas(pageContainer, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const imgProps = pdf.getImageProperties(imgData);
      const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;

      if (i > 0) {
        pdf.addPage();
      }

      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, imgHeight);
    }

    pdf.save(`medicines_${new Date().toISOString().split("T")[0]}.pdf`);
  } catch (error) {
    console.error("Error generating PDF:", error);
    return false;
  } finally {
    pages.forEach((p) => {
      if (document.body.contains(p)) {
        document.body.removeChild(p);
      }
    });
  }

  return true;
}

export function exportToCSV(
  medicines: Medicine[],
  lang: Language = "ar",
): boolean {
  if (medicines.length === 0) return false;
  const t = translations[lang];

  const grouped: Record<string, Record<string, number>> = {};
  medicines.forEach((m) => {
    const name = m.name || "";
    if (!grouped[name]) grouped[name] = {};
    if (m.expiryDates.length === 0) {
      grouped[name][t.csvNoDate] = (grouped[name][t.csvNoDate] || 0) + 1;
    } else {
      m.expiryDates.forEach((d) => {
        grouped[name][d] = (grouped[name][d] || 0) + 1;
      });
    }
  });

  const allGrouped = Object.keys(grouped).map((name) => {
    const datesObj = grouped[name];
    const dates = Object.keys(datesObj).map((date) => ({
      date,
      count: datesObj[date],
    }));
    dates.sort((a, b) => {
      if (a.date === t.csvNoDate) return 1;
      if (b.date === t.csvNoDate) return -1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
    return { name, dates };
  });

  allGrouped.sort((a, b) => {
    const aDateStr = a.dates[0]?.date;
    const bDateStr = b.dates[0]?.date;
    
    if (aDateStr === t.csvNoDate && bDateStr !== t.csvNoDate) return 1;
    if (bDateStr === t.csvNoDate && aDateStr !== t.csvNoDate) return -1;
    if (aDateStr === t.csvNoDate && bDateStr === t.csvNoDate) return 0;
    
    const aTime = new Date(aDateStr).getTime();
    const bTime = new Date(bDateStr).getTime();
    
    // Handle invalid dates if any
    if (isNaN(aTime) && isNaN(bTime)) return 0;
    if (isNaN(aTime)) return 1;
    if (isNaN(bTime)) return -1;
    
    return aTime - bTime;
  });

  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8" /><style>td, th { vertical-align: top; text-align: ${lang === 'ar' ? 'right' : 'left'}; font-family: Arial, sans-serif; font-size: 14px; font-weight: normal; } th { font-weight: normal; }</style></head><body dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><table border="1">`;
  html += `<thead><tr><th style="background-color: #f3f4f6;">${t.csvMedicineName}</th><th style="background-color: #f3f4f6;">${t.csvExpiryDate}</th><th style="background-color: #f3f4f6;">${t.csvStatus}</th></tr></thead><tbody>`;

  allGrouped.forEach((item) => {
    const statusBgAndColor = item.dates.map(d => {
      let statusText = t.csvSafe;
      let badgeBg = "#94D2BD";
      let badgeColor = "#0f3d2f";
      const status = getStatus(d.date);
      if (status === "expired") {
        statusText = t.csvExpired;
        badgeBg = "#ffe2dd";
        badgeColor = "#d44c47";
      } else if (status === "very_soon") {
        statusText = t.csvVerySoon;
        badgeBg = "#fadec9";
        badgeColor = "#cc4e00"; // Orange
      } else if (status === "soon") {
        statusText = t.csvExpiringSoon;
        badgeBg = "#fdecc8";
        badgeColor = "#402c1b"; // Yellow
      }
      return { statusText, badgeBg, badgeColor, date: d.date, count: d.count };
    });

    const dateCol = statusBgAndColor.map(d => {
       const dateStr = d.count > 1 ? `${d.date} (${d.count})` : d.date;
       return `<font color="${d.badgeColor}">${dateStr}</font>`;
    }).join('<br style="mso-data-placement:same-cell;"/>');

    const statusCol = statusBgAndColor.map(d => {
      return `<span style="background-color: ${d.badgeBg}; color: ${d.badgeColor}; padding: 2px 6px; border-radius: 3px;">${d.statusText}</span>`;
    }).join('<br style="mso-data-placement:same-cell;"/>');

    html += `<tr><td>${item.name}</td><td>${dateCol}</td><td>${statusCol}</td></tr>`;
  });

  html += `</tbody></table></body></html>`;

  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute(
    "download",
    `${t.csvFilename}_${new Date().toISOString().split("T")[0]}.xls`,
  );
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
}
