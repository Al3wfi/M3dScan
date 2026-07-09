import React, { useState, useEffect, useRef } from "react";
import { Tutorial } from "./Tutorial";
import { InstallPrompt } from "./InstallPrompt";
import {
  Plus,
  Download,
  FileSpreadsheet,
  Loader2,
  ArrowRight,
  Check,
  Pill,
  Calendar as CalendarIcon,
  Trash2,
  Camera,
  Edit2,
  X,
  Folder,
  FolderPlus,
  ArrowLeft,
  ArrowRightLeft,
  Upload,
  FileUp,
  ScanLine,
  Database,
  Search,
  Image as ImageIcon,
} from "lucide-react";
import { CameraCapture } from "./components/CameraCapture";
import { BarcodeScanner } from "./components/BarcodeScanner";
import { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } from "@zxing/library";
import { Medicine, Project, ReferenceMedicine } from "./types";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { parseGS1 } from "./gs1Parser";
import {
  exportToCSV,
  exportToPDF,
  isExpiringWithinSixMonths,
  getStatus,
  isExpired,
} from "./utils";
import { motion, AnimatePresence } from "motion/react";
import { translations, Language } from "./translations";

type Step =
  | "projects"
  | "list"
  | "capture-details"
  | "confirm-details"
  | "capture-expiry"
  | "confirm-expiry"
  | "edit-medicine"
  | "scan-barcode";

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 15 }, (_, i) => CURRENT_YEAR + i);
const MONTHS = Array.from({ length: 12 }, (_, i) =>
  String(i + 1).padStart(2, "0"),
);

export default function App() {
  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem("projects");
    if (saved) return JSON.parse(saved);

    // Migrate old medicines if any
    const oldMedicines = localStorage.getItem("medicines");
    if (oldMedicines && JSON.parse(oldMedicines).length > 0) {
      return [
        {
          id: crypto.randomUUID(),
          name: "Default Project",
          medicines: JSON.parse(oldMedicines),
          createdAt: Date.now(),
        },
      ];
    }

    return [];
  });

  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<Step>("projects");
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);
  const [scanSource, setScanSource] = useState<"new" | "edit">("new");
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [editingNameValue, setEditingNameValue] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [medicineToDelete, setMedicineToDelete] = useState<Medicine | null>(null);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [currentMed, setCurrentMed] = useState<Partial<Medicine>>({});
  const [currentExpiryDate, setCurrentExpiryDate] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [referenceDb, setReferenceDb] = useState<ReferenceMedicine[]>(() => {
    const saved = localStorage.getItem("referenceDb");
    if (saved) return JSON.parse(saved);
    return [];
  });
  
  const [showReferenceDbModal, setShowReferenceDbModal] = useState(false);

  const currentProject = projects.find((p) => p.id === currentProjectId);
  const medicines = currentProject?.medicines || [];

  const updateMedicines = (
    newMedicines: Medicine[] | ((prev: Medicine[]) => Medicine[]),
  ) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id === currentProjectId) {
          return {
            ...p,
            medicines:
              typeof newMedicines === "function"
                ? newMedicines(p.medicines)
                : newMedicines,
          };
        }
        return p;
      }),
    );
  };

  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem("lang");
    return (saved as Language) || "en";
  });
  const [, setLastActive] = useState(Date.now());

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setLastActive(Date.now());
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem("isDarkMode");
    return saved === "true";
  });
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [barcodeText, setBarcodeText] = useState<string | null>(null);
  const [isBarcodeProcessing, setIsBarcodeProcessing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [employeeName, setEmployeeName] = useState("");
  const [reportLogo, setReportLogo] = useState<string | null>(null);
  const [isUploadingDb, setIsUploadingDb] = useState(false);
  const [uploadDbProgress, setUploadDbProgress] = useState(0);
  const [pendingUploadData, setPendingUploadData] = useState<ReferenceMedicine[] | null>(null);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    localStorage.setItem("referenceDb", JSON.stringify(referenceDb));
  }, [referenceDb]);

  useEffect(() => {
    localStorage.setItem("projects", JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    localStorage.setItem("lang", lang);
  }, [lang]);

  useEffect(() => {
    localStorage.setItem("isDarkMode", String(isDarkMode));
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      if (metaThemeColor) metaThemeColor.setAttribute("content", "#020617");
    } else {
      document.documentElement.classList.remove("dark");
      if (metaThemeColor) metaThemeColor.setAttribute("content", "#ffffff");
    }
  }, [isDarkMode]);

  const t = translations[lang];
  const nameSuggestions = referenceDb
    .filter((med) =>
      currentMed.name &&
      med.name.toLowerCase().includes(currentMed.name.toLowerCase()) &&
      med.name.toLowerCase() !== currentMed.name.toLowerCase()
    )
    .map(m => m.name)
    .filter((value, index, self) => self.indexOf(value) === index)
    .slice(0, 50);

  const dir = "ltr";
  const textDir = lang === "ar" ? "rtl" : "ltr";
  const textAlign = lang === "ar" ? "text-right" : "text-left";


  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(null), 3000);
  };

  const handleReferenceDbUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingDb(true);
    setUploadDbProgress(0);

    const progressInterval = setInterval(() => {
      setUploadDbProgress((prev) => Math.min(prev + 10, 90));
    }, 100);

    try {
      let parsed: any[] = [];
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith('.json')) {
        const text = await file.text();
        parsed = JSON.parse(text);
      } else {
        // Handle excel and csv via xlsx
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        parsed = XLSX.utils.sheet_to_json(worksheet);
      }

      if (Array.isArray(parsed)) {
        // Normalize the keys to ensure we have 'name' and 'batchNumber'
        const normalized = parsed.map((item: any) => {
          const values = Object.values(item);
          const name = item.name || item.Name || item.NAME || item.drugName || item.DrugName || item.medicine || item.Medicine || item.medicineName || item.Drug || item["اسم الدواء"] || item["الصنف"] || item["الاسم"] || item["Item"] || values[0] || "";
          const batchNumber = item.batchNumber || item.BatchNumber || item.BATCH || item.batch || item.Batch || item.Lot || item.lot || item.LotNumber || item.lotNumber || item["Lot Number"] || item["باتش"] || item["الدفعة"] || item["رقم التشغيلة"] || item["رقم الطبخة"] || values[1] || "";
          let expiryDate = item.expiryDate || item.ExpiryDate || item.expiry || item.Expiry || item.EXP || item.exp || item["تاريخ الانتهاء"] || item["الصلاحية"] || item["تاريخ الصلاحية"] || "";
          const gtin = item.gtin || item.GTIN || item.barcode || item.Barcode || item["باركود"] || item["الباركود"] || "";
          
          if (typeof expiryDate === 'number' && !fileName.endsWith('.json')) {
             // Excel date number
             const date = new Date(Math.round((expiryDate - 25569) * 86400 * 1000));
             expiryDate = date.toISOString().split('T')[0];
          }

          return {
            ...item,
            name: String(name),
            batchNumber: String(batchNumber),
            expiryDate: String(expiryDate),
            gtin: String(gtin)
          };
        }).filter(item => item.name || item.batchNumber || item.gtin);

        clearInterval(progressInterval);
        setUploadDbProgress(100);
        
        setTimeout(() => {
          setIsUploadingDb(false);
          setPendingUploadData(normalized);
        }, 500);

      } else {
        clearInterval(progressInterval);
        setIsUploadingDb(false);
        alert(lang === "ar" ? "تنسيق الملف غير صحيح. تأكد من أن الملف يحتوي على جدول بيانات." : "Invalid file format. Ensure the file contains a data table.");
      }
    } catch (error) {
      clearInterval(progressInterval);
      setIsUploadingDb(false);
      console.error("Error parsing file:", error);
      alert(lang === "ar" ? "حدث خطأ أثناء قراءة الملف. يرجى التأكد من أن الملف صالح (Excel, CSV, أو JSON)." : "Error reading file. Please ensure it is a valid file (Excel, CSV, or JSON).");
    }
    
    // Clear input
    e.target.value = '';
  };

  const confirmUpload = () => {
    if (pendingUploadData) {
      setReferenceDb(pendingUploadData);
      setPendingUploadData(null);
      alert(lang === "ar" ? "تم تحديث قاعدة البيانات بنجاح!" : "Database updated successfully!");
    }
  };

  const processBarcode = async (base64Image: string, isExpiryStep: boolean) => {
    setIsBarcodeProcessing(true);
    setBarcodeText(null);
    try {
      const hints = new Map();
    hints.set(DecodeHintType.TRY_HARDER, true);
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.QR_CODE,
      BarcodeFormat.DATA_MATRIX,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.ITF
    ]);
    const codeReader = new BrowserMultiFormatReader(hints);
      const img = new Image();
      img.src = base64Image;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      const result = await codeReader.decodeFromImageElement(img);
      const text = result.getText();
      let extractedData = text;

      // Extract GTIN (AI 01)
      const gtinRegex = /01(\d{14})/;
      const gtinMatch = gtinRegex.exec(text);
      if (gtinMatch) {
        extractedData += `\n[GTIN: ${gtinMatch[1]}]`;
      }

      // Extract Lot (AI 10) - usually variable length at the end or separated by FNC1, but we can try basic regex if it ends the string or followed by GS (often char code 29)
      // Since it's hard to find the end without FNC1 parsing, we'll try to match it if it's there
      const lotRegex = /10([a-zA-Z0-9]{1,20})/;
      const lotMatch = lotRegex.exec(text);
      if (lotMatch) {
        // Just extract the next characters, it might over-extract if not careful, but it's fine for a display hint
        extractedData += `\n[LOT: ${lotMatch[1]}]`;
      }

      setBarcodeText(extractedData);
    } catch (err: any) {
      if (
        err?.name !== "NotFoundException" &&
        !(err?.message || "").includes("No MultiFormat Readers")
      ) {
        console.error("Barcode Error:", err);
      }
    } finally {
      setIsBarcodeProcessing(false);
    }
  };

  const processOcr = async (base64Image: string) => {
    setIsOcrProcessing(true);
    setOcrText(null);
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng+ara");
      const {
        data: { text },
      } = await worker.recognize(base64Image);
      setOcrText(text);
      await worker.terminate();
    } catch (err) {
      console.error("OCR Error:", err);
      setOcrText(t.analyzeError);
    } finally {
      setIsOcrProcessing(false);
    }
  };

  const handleCaptureDetails = async (base64Image: string) => {
    setCapturedImage(base64Image);

    // Try local barcode decode first to save tokens
    let localFoundName = "";
    try {
      const hints = new Map();
    hints.set(DecodeHintType.TRY_HARDER, true);
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.QR_CODE,
      BarcodeFormat.DATA_MATRIX,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.ITF
    ]);
    const codeReader = new BrowserMultiFormatReader(hints);
      const img = new Image();
      img.src = base64Image;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      const result = await codeReader.decodeFromImageElement(img);
      const text = result.getText();
      const { batch, gtin } = parseGS1(text);
      const resolvedBatch = batch || text.trim();
      const resolvedGtin = gtin || "";
      
      const batchStr = String(resolvedBatch).trim().toLowerCase();
      const gtinStr = String(resolvedGtin).trim().toLowerCase();

      const found = referenceDb.find((m: any) => {
        let matchBatch = false;
        let matchGtin = false;
        if (m.gtin && gtinStr) {
           const refGtin = String(m.gtin).trim().toLowerCase();
           if (refGtin === gtinStr) matchGtin = true;
        }
        if (m.batchNumber && batchStr) {
          const refBatch = String(m.batchNumber).trim().toLowerCase();
          if (refBatch === batchStr) matchBatch = true;
        }
        return matchGtin || matchBatch;
      });
      if (found) {
        localFoundName = found.name;
      }
    } catch (e) {
      // no barcode found or error, proceed to normal flow
    }

    if (localFoundName) {
      setCurrentMed({
        id: crypto.randomUUID(),
        name: localFoundName,
        expiryDates: [],
      });
      setActiveStep("confirm-details");
      if (isOfflineMode) {
        processOcr(base64Image);
        processBarcode(base64Image, false);
      }
      return;
    }

    if (isOfflineMode) {
      setCurrentMed({
        id: crypto.randomUUID(),
        name: "",
        expiryDates: [],
      });
      setActiveStep("confirm-details");
      processOcr(base64Image);
      processBarcode(base64Image, false);
      return;
    }

    setIsAnalyzing(true);
    abortControllerRef.current = new AbortController();
    try {
      const res = await fetch("/api/extract", {
        signal: abortControllerRef.current.signal,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64Image, mode: "details" }),
      });
      const data = await res.json();
      
      let combinedName = data.name || "";
      if (data.concentration) {
        const conc = String(data.concentration).trim();
        if (conc && !combinedName.toLowerCase().includes(conc.toLowerCase())) {
          combinedName = `${combinedName} ${conc}`.trim();
        }
      }

      setCurrentMed({
        id: crypto.randomUUID(),
        name: combinedName,
        expiryDates: [],
      });
      setActiveStep("confirm-details");
    } catch (err: any) {
      if (err?.name !== "AbortError" && err !== "User cancelled" && err?.message !== "User cancelled") {
        console.error(err);
        showError(t.analyzeError);
        setActiveStep("list");
      }
    } finally {
      setIsAnalyzing(false);
      abortControllerRef.current = null;
    }
  };

  const handleCaptureExpiry = async (base64Image: string) => {
    setCapturedImage(base64Image);

    // Try local barcode decode first for expiry to save tokens
    let localFoundExpiry = "";
    try {
      const hints = new Map();
    hints.set(DecodeHintType.TRY_HARDER, true);
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.QR_CODE,
      BarcodeFormat.DATA_MATRIX,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.ITF
    ]);
    const codeReader = new BrowserMultiFormatReader(hints);
      const img = new Image();
      img.src = base64Image;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      const result = await codeReader.decodeFromImageElement(img);
      const text = result.getText();
      const { expiry, batch, gtin } = parseGS1(text);
      if (expiry) {
        localFoundExpiry = expiry;
      }
    } catch (e) {
      // ignore
    }

    if (localFoundExpiry) {
      setCurrentMed(prev => ({
        ...prev,
        expiryDates: [...(prev.expiryDates || []), localFoundExpiry]
      }));
      setCurrentExpiryDate("");
      setActiveStep("edit-medicine");
      if (isOfflineMode) {
        processOcr(base64Image);
        processBarcode(base64Image, true);
      }
      return;
    }

    if (isOfflineMode) {
      setCurrentExpiryDate("");
      setActiveStep("confirm-expiry");
      processOcr(base64Image);
      processBarcode(base64Image, true);
      return;
    }

    setIsAnalyzing(true);
    abortControllerRef.current = new AbortController();
    try {
      const res = await fetch("/api/extract", {
        signal: abortControllerRef.current.signal,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64Image, mode: "expiry" }),
      });
      const data = await res.json();
      const extractedDate = data.date || "";
      if (extractedDate) {
        setCurrentMed(prev => ({
          ...prev,
          expiryDates: [...(prev.expiryDates || []), extractedDate]
        }));
      }
      setCurrentExpiryDate("");
      setActiveStep("edit-medicine");
    } catch (err: any) {
      if (err?.name !== "AbortError" && err !== "User cancelled" && err?.message !== "User cancelled") {
        console.error(err);
        showError(t.analyzeError);
        setActiveStep(scanSource === "edit" ? "edit-medicine" : "confirm-details");
      }
    } finally {
      setIsAnalyzing(false);
      abortControllerRef.current = null;
    }
  };

  const handleScanBarcode = (data: string) => {
    const { expiry, batch, gtin } = parseGS1(data);
    const resolvedBatch = batch || data.trim();
    const resolvedGtin = gtin || "";
    
    let initialName = currentMed.name || "";
    let initialExpiry = expiry || "";

    if ((resolvedBatch || resolvedGtin) && !initialName) {
      const batchStr = String(resolvedBatch).trim().toLowerCase();
      const gtinStr = String(resolvedGtin).trim().toLowerCase();

      const found = referenceDb.find((m: any) => {
        let matchBatch = false;
        let matchGtin = false;

        if (m.gtin && gtinStr) {
           const refGtin = String(m.gtin).trim().toLowerCase();
           if (refGtin === gtinStr) matchGtin = true;
        }
        
        if (m.batchNumber && batchStr) {
          const refBatch = String(m.batchNumber).trim().toLowerCase();
          if (refBatch === batchStr) matchBatch = true;
        }

        // Return true if it matches GTIN, or if it matches Batch (if GTIN isn't present to override it)
        return matchGtin || matchBatch;
      });
      if (found) {
        initialName = found.name;
        if (!initialExpiry && found.expiryDate) {
          initialExpiry = found.expiryDate;
          const months: Record<string, string> = {
            'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
            'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
          };
          const parts = found.expiryDate.split('-');
          if (parts.length === 3) {
            let d = parts[0].padStart(2, '0');
            let m = months[parts[1]] || '01';
            let y = '20' + parts[2];
            initialExpiry = `${y}-${m}-${d}`;
          }
        }
      }
    }

    setCurrentMed(prev => {
      const newExpiryDates = [...(prev.expiryDates || [])];
      if (initialExpiry) {
        newExpiryDates.push(initialExpiry);
      }
      return { 
        ...prev, 
        batchInfo: resolvedBatch || prev.batchInfo,
        name: initialName,
        expiryDates: newExpiryDates
      };
    });
    setCurrentExpiryDate("");
    setActiveStep("edit-medicine");
  };

  const handleCameraBarcode = (data: string) => {
    const { expiry, batch, gtin } = parseGS1(data);
    const resolvedBatch = batch || data.trim();
    const resolvedGtin = gtin || "";
    
    let initialName = currentMed.name || "";
    let initialExpiry = expiry || "";

    if ((resolvedBatch || resolvedGtin) && !initialName) {
      const batchStr = String(resolvedBatch).trim().toLowerCase();
      const gtinStr = String(resolvedGtin).trim().toLowerCase();

      const found = referenceDb.find((m: any) => {
        let matchBatch = false;
        let matchGtin = false;

        if (m.gtin && gtinStr) {
           const refGtin = String(m.gtin).trim().toLowerCase();
           if (refGtin === gtinStr) matchGtin = true;
        }
        
        if (m.batchNumber && batchStr) {
          const refBatch = String(m.batchNumber).trim().toLowerCase();
          if (refBatch === batchStr) matchBatch = true;
        }

        return matchGtin || matchBatch;
      });
      if (found) {
        initialName = found.name;
        if (!initialExpiry && found.expiryDate) {
          initialExpiry = found.expiryDate;
          const months: Record<string, string> = {
            'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
            'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
          };
          const parts = found.expiryDate.split('-');
          if (parts.length === 3) {
            let d = parts[0].padStart(2, '0');
            let m = months[parts[1]] || '01';
            let y = '20' + parts[2];
            initialExpiry = `${y}-${m}-${d}`;
          }
        }
      }
    }

    setCurrentMed(prev => {
      const newExpiryDates = [...(prev.expiryDates || [])];
      if (initialExpiry) {
        newExpiryDates.push(initialExpiry);
      }
      return { 
        ...prev, 
        batchInfo: resolvedBatch || prev.batchInfo,
        name: initialName,
        expiryDates: newExpiryDates
      };
    });
    setCurrentExpiryDate("");
    
    if (activeStep === "capture-details") {
       setScanSource("new");
    }
    setActiveStep("edit-medicine");
  };

  const handleSaveExpiry = (finish: boolean) => {
    let newDates = currentMed.expiryDates || [];
    if (currentExpiryDate && currentExpiryDate.trim() !== "") {
      newDates = [...newDates, currentExpiryDate];
    }

    const updatedMed = {
      ...currentMed,
      expiryDates: newDates,
    };

    setCurrentMed(updatedMed);
    setCurrentExpiryDate("");

    if (finish) {
      if (scanSource === "edit") {
        setActiveStep("edit-medicine");
      } else {
        // Save to list
        updateMedicines((prev) => {
          const exists = prev.some((m) => m.id === updatedMed.id);
          if (exists) {
            return prev.map((m) =>
              m.id === updatedMed.id ? (updatedMed as Medicine) : m,
            );
          }
          return [...prev, updatedMed as Medicine];
        });
        setCurrentMed({});
        setActiveStep("list");
      }
    } else {
      // Add another date
      setActiveStep("scan-barcode");
    }
  };

  const removeExpiryDate = (indexToRemove: number) => {
    setCurrentMed((prev) => ({
      ...prev,
      expiryDates: (prev.expiryDates || []).filter(
        (_, i) => i !== indexToRemove,
      ),
    }));
  };

  const editMedicine = (id: string) => {
    const med = medicines.find((m) => m.id === id);
    if (med) {
      setCurrentMed(med);
      setIsOfflineMode(true);
      setCapturedImage(null);
      setOcrText(null);
      setBarcodeText(null);
      setActiveStep("edit-medicine");
    }
  };

  const deleteMedicine = (id: string) => {
    updateMedicines((prev) => prev.filter((m) => m.id !== id));
  };


  const clearAllMedicines = () => {
    setShowClearConfirm(true);
  };

  
  const handleGoBack = () => {
    if (activeStep === "list") {
      setActiveStep("projects");
    } else if (activeStep === "capture-details") {
      setActiveStep("list");
    } else if (activeStep === "confirm-details") {
      setActiveStep("list");
    } else if (activeStep === "capture-expiry") {
      setActiveStep(scanSource === "edit" ? "edit-medicine" : "confirm-details");
    } else if (activeStep === "scan-barcode") {
      if (scanSource === "edit") setActiveStep("edit-medicine");
      else if (currentMed.name || currentMed.batchInfo || currentMed.expiryDates?.length > 0) setActiveStep("confirm-details");
      else setActiveStep("list");
    } else if (activeStep === "edit-medicine") {
      setActiveStep("list");
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const x = e.targetTouches[0].clientX;
    const edgeThreshold = 50;
    if (x > edgeThreshold && x < window.innerWidth - edgeThreshold) {
      setTouchStartX(null);
      return;
    }
    setTouchEndX(null);
    setTouchStartX(x);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    setTouchEndX(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (touchStartX === null || touchEndX === null) {
      setTouchStartX(null);
      setTouchEndX(null);
      return;
    }
    const distance = touchStartX - touchEndX;
    let isSwipeBack = false;
    if (touchStartX > window.innerWidth - 50 && distance > 50) isSwipeBack = true;
    if (touchStartX < 50 && distance < -50) isSwipeBack = true;
    
    if (isSwipeBack) {
      handleGoBack();
    }
    setTouchStartX(null);
    setTouchEndX(null);
  };

  return (
    <div className={`${isDarkMode ? "dark" : ""}`} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      
      <Tutorial lang={lang} activeStep={activeStep} />
      <div
        className={`min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-white flex flex-col lg:flex-row font-sans`}
        dir={dir}
      >
        {/* SIDEBAR */}
        {activeStep !== "edit-medicine" && (
        <div className="lg:w-1/3 border-b lg:border-b-0 lg:border-l lg:rtl:border-l-0 lg:rtl:border-r border-slate-100 dark:border-slate-800 flex flex-col p-6 lg:p-8 justify-between bg-white dark:bg-slate-950 shrink-0 h-auto lg:h-screen lg:sticky lg:top-0 lg:overflow-y-auto">
          
          <div className="flex flex-col flex-1 h-full min-h-0 space-y-8">
                        <div className="flex flex-col gap-2 ltr:pr-2 rtl:pl-2 w-full" dir="ltr">
              <div className="flex items-center justify-between w-full gap-2">
                <h1
                  className={`font-black uppercase text-left flex-1 min-w-0 truncate ${
                    (activeStep === "projects" ? t.appTitle : (projects.find(p => p.id === currentProjectId)?.name || t.appTitle)).length > 12 
                    ? "text-2xl lg:text-3xl" 
                    : "text-4xl"
                  } ${activeStep !== "projects" ? "cursor-pointer hover:opacity-80 transition-opacity" : ""} ${activeStep === "projects" ? "font-alexandria" : ""}`}
                  id="btn-category-title"
                  onClick={() => {
                    if (activeStep !== "projects") {
                      setActiveStep("projects");
                    }
                  }}
                  title={activeStep === "projects" ? t.appTitle : (projects.find(p => p.id === currentProjectId)?.name || t.appTitle)}
                >
                  {activeStep === "projects"
                    ? t.appTitle 
                    : (projects.find(p => p.id === currentProjectId)?.name || t.appTitle)}
                </h1>
                
                {activeStep === "projects" ? (
                  <button
                    onClick={() => setLang(lang === "ar" ? "en" : "ar")}
                    className="mt-2 p-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center w-7 h-7 font-black text-[10px] shrink-0"
                    title={t.toggleLanguage}
                  >
                    {lang === "ar" ? "EN" : "AR"}
                  </button>
                ) : activeStep === "list" ? (
                  <button
                    onClick={() => {
                      setCurrentMed({
                        id: crypto.randomUUID(),
                        name: "",
                        expiryDates: [],
                      });
                      setActiveStep("edit-medicine");
                    }}
                    id="btn-manual"
                    className="mt-2 p-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center shrink-0 w-7 h-7"
                    title={lang === "ar" ? "إضافة دواء يدوي" : "Add Manual Entry"}
                  >
                    <Plus className="w-4 h-4 text-[#0E9594]" />
                  </button>
                ) : null}
              </div>
              
              {(activeStep === "projects") && (
                <div className="text-slate-400 dark:text-slate-500 font-medium text-sm text-left">
                  {t.appSubtitle}
                </div>
              )}
            </div>

            {activeStep === "projects" && (
            <div className="pt-6 lg:pt-12 space-y-4 flex flex-col flex-1 min-h-0">
                <div className="flex flex-col gap-3 mt-8 lg:mt-0 flex-1 min-h-0">
                  <div className="flex items-center justify-between mb-2 ltr:pr-2 rtl:pl-2">
                    <h3 className={`font-black text-lg uppercase text-slate-500 ${textAlign}`} dir={textDir}>
                      {t.projectsTitle || "Projects"}
                    </h3>
                    <div className="flex items-center gap-2">

                      <div className="relative flex items-center justify-center" title={lang === "ar" ? "تحديث قاعدة بيانات الأدوية" : "Update Medicines Database"}>
                        <input type="file"
                          accept=".json,.csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                          onChange={handleReferenceDbUpload}
                          className={`absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10  ${textAlign}`} dir={textDir}
                          title=""
                        />
                        <button
                          type="button"
                          id="btn-database"
                          className="w-7 h-7 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center relative z-0 p-1.5 shrink-0"
                        >
                          <Database className="w-4 h-4" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
  setIsAddingProject(true);
  setNewProjectName("");
}}
                        
                        id="btn-new-project" className="w-7 h-7 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center cursor-pointer relative z-50 p-1.5 shrink-0"
                        title={t.newProject || "New Project"}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div id="projects-list-container" className="flex flex-col gap-2 flex-1 overflow-y-auto ltr:pr-2 rtl:pl-2 min-h-0 pb-4">
                    {projects.map((project) => (
                      <div key={project.id} className="relative overflow-hidden mb-2 bg-slate-100 dark:bg-slate-800 rounded-2xl shrink-0">
                        <div className="absolute inset-y-0 left-0 w-1/2 bg-[#f2542d] flex items-center px-4">
                          <Trash2 className="w-5 h-5 text-white" />
                        </div>
                        <div className="absolute inset-y-0 right-0 w-1/2 bg-[#0e9594] flex items-center justify-end px-4">
                          <Edit2 className="w-5 h-5 text-white" />
                        </div>
                        <motion.div
                          drag="x"
                          dragConstraints={{ left: 0, right: 0 }}
                          dragElastic={0.5}
                          onDragEnd={(e, info) => {
                            if (info.offset.x > 80) {
                              setProjectToDelete(project);
                            } else if (info.offset.x < -80) {
                              setProjectToEdit(project);
                              setEditingNameValue(project.name);
                            }
                          }}
                          onClick={() => {
                            setCurrentProjectId(project.id);
                            setActiveStep("list");
                          }}
                          className="p-3 relative z-10 bg-slate-900 dark:bg-white border-2 border-slate-900 dark:border-white rounded-2xl text-white dark:text-slate-900 hover:opacity-90 transition-colors flex items-center group cursor-pointer w-full"
                        >
                          <span className="font-bold text-lg truncate w-full text-start">
                            {project.name}
                          </span>
                        </motion.div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            
            
            {projectToDelete && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-sm"
                >
                  <h3 className={`text-xl font-black mb-2 ${textAlign}`} dir={textDir}>
                    {lang === "ar" ? "تأكيد الحذف" : "Confirm Deletion"}
                  </h3>
                  <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">
                    {lang === "ar"
                      ? `هل أنت متأكد من حذف الفئة "${projectToDelete.name}" بالكامل؟ لا يمكن التراجع عن هذا الإجراء.`
                      : `Are you sure you want to completely delete the category "${projectToDelete.name}"? This action cannot be undone.`}
                  </p>
                  <div className="flex gap-4">
                    <button
                      onClick={() => setProjectToDelete(null)}
                      className="flex-1 py-3 px-4 font-bold uppercase  text-xs border-2 border-slate-200 dark:border-slate-800 hover:border-slate-900 dark:hover:border-white transition-colors rounded-2xl"
                    >
                      {lang === "ar" ? "إلغاء" : "Cancel"}
                    </button>
                    <button
                      onClick={() => {
                        setProjects((prev) =>
                          prev.filter((p) => p.id !== projectToDelete.id),
                        );
                        if (currentProjectId === projectToDelete.id) {
                          setCurrentProjectId(null);
                        }
                        setProjectToDelete(null);
                      }}
                      className="flex-1 py-3 px-4 font-bold uppercase  text-xs bg-[#f2542d] text-white hover:bg-[#d44320] transition-colors rounded-2xl"
                    >
                      {lang === "ar" ? "نعم، احذف" : "Yes, Delete"}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}

            

            {isAddingProject && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-sm"
                >
                  <h3 className={`text-xl font-black mb-4 ${textAlign}`} dir={textDir}>
                    {t.newProject || "New Project"}
                  </h3>
                  <input
                    type="text"
                    autoFocus
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder={t.projectNamePlaceholder || "Project Name"}
                    className="w-full bg-white dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 rounded-2xl p-3 mb-6 text-sm font-bold focus:outline-none focus:border-slate-900 dark:focus:border-white transition-colors placeholder:font-medium placeholder:text-slate-400"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newProjectName.trim()) {
                        const newProject: Project = {
                          id: crypto.randomUUID(),
                          name: newProjectName.trim(),
                          medicines: [],
                          createdAt: Date.now(),
                        };
                        setProjects((prev) => [...prev, newProject]);
                        setCurrentProjectId(newProject.id);
                        setIsAddingProject(false);
                        setNewProjectName("");
                      } else if (e.key === "Escape") {
                        setIsAddingProject(false);
                        setNewProjectName("");
                      }
                    }}
                  />
                  <div className="flex gap-4">
                    <button
                      onClick={() => {
                        setIsAddingProject(false);
                        setNewProjectName("");
                      }}
                      className="flex-1 py-3 px-4 font-bold uppercase  text-xs border-2 border-slate-200 dark:border-slate-800 hover:border-slate-900 dark:hover:border-white transition-colors rounded-2xl"
                    >
                      {lang === "ar" ? "إلغاء" : "Cancel"}
                    </button>
                    <button
                      onClick={() => {
                        if (newProjectName.trim()) {
                          const newProject: Project = {
                            id: crypto.randomUUID(),
                            name: newProjectName.trim(),
                            medicines: [],
                            createdAt: Date.now(),
                          };
                          setProjects((prev) => [...prev, newProject]);
                          setCurrentProjectId(newProject.id);
                        }
                        setIsAddingProject(false);
                        setNewProjectName("");
                      }}
                      className="flex-1 py-3 px-4 font-bold uppercase  text-xs bg-white dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-white hover:border-slate-900 dark:hover:border-white transition-colors"
                    >
                      {lang === "ar" ? "إضافة" : "Add"}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}

            {projectToEdit && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-sm"
                >
                  <h3 className={`text-xl font-black mb-4 ${textAlign}`} dir={textDir}>
                    {lang === "ar" ? "تعديل اسم الفئة" : "Edit Category Name"}
                  </h3>
                  <input
                    type="text"
                    autoFocus
                    value={editingNameValue}
                    onChange={(e) => setEditingNameValue(e.target.value)}
                    placeholder={t.projectNamePlaceholder || "Project Name"}
                    className="w-full bg-white dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 rounded-2xl p-3 mb-6 text-sm font-bold focus:outline-none focus:border-slate-900 dark:focus:border-white transition-colors placeholder:font-medium placeholder:text-slate-400"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && editingNameValue.trim()) {
                        setProjects((prev) =>
                          prev.map((p) =>
                            p.id === (projectToEdit ? projectToEdit.id : currentProjectId)
                              ? { ...p, name: editingNameValue.trim() }
                              : p
                          )
                        );
                        
                        setProjectToEdit(null);
                      } else if (e.key === "Escape") {
                        
                        setProjectToEdit(null);
                      }
                    }}
                  />
                  <div className="flex gap-4">
                    <button
                      onClick={() => {
                        
                        setProjectToEdit(null);
                      }}
                      className="flex-1 py-3 px-4 font-bold uppercase  text-xs border-2 border-slate-200 dark:border-slate-800 hover:border-slate-900 dark:hover:border-white transition-colors rounded-2xl"
                    >
                      {lang === "ar" ? "إلغاء" : "Cancel"}
                    </button>
                    <button
                      onClick={() => {
                        if (editingNameValue.trim()) {
                          setProjects((prev) =>
                            prev.map((p) =>
                              p.id === (projectToEdit ? projectToEdit.id : currentProjectId)
                                ? { ...p, name: editingNameValue.trim() }
                                : p
                            )
                          );
                        }
                        
                        setProjectToEdit(null);
                      }}
                      className="flex-1 py-3 px-4 font-bold uppercase  text-xs bg-white dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-white hover:border-slate-900 dark:hover:border-white transition-colors"
                    >
                      {lang === "ar" ? "حفظ" : "Save"}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </div>

          <div className="space-y-4 hidden lg:block mt-8">
            <div
              className={`bg-emerald-50 dark:bg-emerald-900/20 p-6 border-l-4 rtl:border-r-4 rtl:border-l-0 border-emerald-500`}
            >
              <p className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400  mb-1">
                {t.systemStatus}
              </p>
              <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-300">
                {t.systemStatusActive}
              </p>
            </div>
          </div>
        </div>

        )}
        {/* MAIN CONTENT */}
        <div className={`${activeStep !== "edit-medicine" ? "lg:w-2/3" : "w-full"} ${activeStep === "projects" ? "hidden lg:flex" : "flex"} bg-slate-50 dark:bg-slate-900 flex-col p-6 lg:p-8 flex-1 lg:min-h-[50vh] lg:h-screen lg:overflow-y-auto relative`}>
          <AnimatePresence mode="wait">
            {activeStep === "projects" && (
              <motion.div
                key="projects"
                
                className="flex flex-col h-full w-full items-center justify-center text-slate-400 dark:text-slate-600"
              >
              </motion.div>
            )}

            {activeStep === "list" && (
              <motion.div
                key="list"
                
                className="flex flex-col h-full"
              >
                <div className="flex flex-row justify-between items-center mb-6 w-full gap-4" dir="ltr">
                  <div className={`flex flex-col justify-center space-y-1 ${lang === "ar" ? "items-end text-right" : "items-start text-left"}`} dir={textDir}>
                    <h2 className="font-alexandria text-6xl font-black leading-none">
                      {String(medicines.length).padStart(2, "0")}
                    </h2>
                    <p className="text-sm font-black uppercase text-slate-400 dark:text-slate-500">
                      {t.totalMedicines}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                      <button id="btn-scan-camera"
                        onClick={() => {
                          setIsOfflineMode(false);
                          setCurrentMed({
                            id: crypto.randomUUID(),
                            name: "",
                            expiryDates: [],
                          });
                          setScanSource("new");
                          setActiveStep("capture-details");
                        }}
                        className="p-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl hover:opacity-90 transition-opacity shadow-lg shadow-slate-900/10 dark:shadow-white/10"
                        title={lang === "ar" ? "التقاط صورة" : "Camera"}
                      >
                        <Camera className="w-8 h-8" />
                      </button>
                      <button id="btn-scan-barcode"
                        onClick={() => {
                          setIsOfflineMode(false);
                          setCurrentMed({
                            id: crypto.randomUUID(),
                            name: "",
                            expiryDates: [],
                          });
                          setScanSource("new");
                          setActiveStep("scan-barcode");
                        }}
                        className="p-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl hover:opacity-90 transition-opacity shadow-lg shadow-slate-900/10 dark:shadow-white/10"
                        title={lang === "ar" ? "مسح باركود" : "Scan Barcode"}
                      >
                        <ScanLine className="w-8 h-8" />
                      </button>
                    </div>
                </div>

                <div className="mb-6 relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                    <Search className={`w-5 h-5 text-slate-400 ${lang === 'ar' ? 'right-4 left-auto' : 'left-4'}`} />
                  </div>
                  <input
                    type="text"
                    placeholder={lang === 'ar' ? "البحث عن دواء..." : "Search medicine..."}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`w-full bg-white dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 rounded-2xl py-4 focus:outline-none focus:border-slate-900 dark:focus:border-white transition-colors text-lg font-bold placeholder:font-medium placeholder:text-slate-400 ${lang === 'ar' ? 'pr-12 pl-4' : 'pl-12 pr-4'} ${textAlign} ${lang === 'ar' ? 'placeholder:text-right' : 'placeholder:text-left'}`} dir={textDir}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className={`absolute inset-y-0 flex items-center ${lang === 'ar' ? 'left-4' : 'right-4'} text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors`}
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>

                <div id="medicines-list-container" className="flex-1 overflow-visible">
                  {medicines.length === 0 ? null : (
                    <div>
                      <div className="grid grid-cols-12 pb-4 border-b border-slate-200 dark:border-slate-800 hidden md:grid">
                        <div className="col-span-5 font-black text-[10px] uppercase  text-slate-400 dark:text-slate-500">
                          {t.medicationStrength}
                        </div>
                        <div className="col-span-4 font-black text-[10px] uppercase  text-slate-400 dark:text-slate-500">
                          {t.expirationCycles}
                        </div>
                        <div className="col-span-3 font-black text-[10px] uppercase  text-slate-400 dark:text-slate-500 text-right rtl:text-start">
                          {t.status}
                        </div>
                      </div>

                      <div className="flex flex-col">
                        {medicines.filter(m => 
                          m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (m.batchInfo && m.batchInfo.toLowerCase().includes(searchQuery.toLowerCase()))
                        ).map((med, index, arr) => {
                          const hasExpired = med.expiryDates.some(
                            (d) => getStatus(d) === "expired",
                          );
                          const hasVerySoon = med.expiryDates.some(
                            (d) => getStatus(d) === "very_soon",
                          );
                          const hasSoon = med.expiryDates.some(
                            (d) => getStatus(d) === "soon",
                          );

                          return (
                            <div key={med.id} className="relative overflow-hidden group border-b border-transparent">
                              <div className="absolute inset-y-0 left-0 w-1/2 bg-[#f2542d] flex items-center px-4">
                                <Trash2 className="w-6 h-6 text-white" />
                              </div>
                              <div className="absolute inset-y-0 right-0 w-1/2 bg-[#0e9594] flex items-center justify-end px-4">
                                <Edit2 className="w-6 h-6 text-white" />
                              </div>
                              <motion.div
                                drag="x"
                                dragConstraints={{ left: 0, right: 0 }}
                                dragElastic={0.5}
                                onDragEnd={(e, info) => {
                                  if (info.offset.x > 80) {
                                    setMedicineToDelete(med);
                                  } else if (info.offset.x < -80) {
                                    editMedicine(med.id);
                                  }
                                }}
                                className="grid grid-cols-1 md:grid-cols-12 py-3 items-center gap-3 md:gap-0 bg-slate-50 dark:bg-slate-900 relative z-10"
                              >
                                <div className="md:col-span-5">
                                <div className="text-base font-bold break-words pr-4 rtl:pr-0 rtl:pl-4 py-1 text-slate-900 dark:text-white">
                                  {med.name}
                                </div>
                              </div>

                              <div className="md:col-span-4 flex flex-wrap gap-2">
                                {med.expiryDates.map((date, i) => {
                                  const status = getStatus(date);
                                  let chipColor =
                                    "bg-[#94D2BD] dark:bg-[#94D2BD]/80 text-teal-950 dark:text-teal-50";
                                  if (status === "expired") {
                                    chipColor =
                                      "bg-red-200 dark:bg-red-900/60 text-red-900 dark:text-red-300";
                                  } else if (status === "very_soon") {
                                    chipColor =
                                      "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400";
                                  } else if (status === "soon") {
                                    chipColor =
                                      "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400";
                                  }

                                  return (
                                    <div
                                      key={i}
                                      className={`inline-block px-2 py-1 text-[10px] font-black rounded-2xl ${chipColor}`}
                                    >
                                      {date}
                                    </div>
                                  );
                                })}
                                {med.expiryDates.length === 0 && (
                                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                                    {t.noDate}
                                  </span>
                                )}
                              </div>

                              <div className="md:col-span-3 flex items-center justify-between md:justify-end gap-3 ltr:md:justify-end">
                                {hasExpired ? (
                                  <span className="text-[10px] font-black text-red-900 dark:text-red-300 uppercase bg-red-200 dark:bg-red-900/60 px-3 py-1.5 rounded-2xl">
                                    {t.expired}
                                  </span>
                                ) : hasVerySoon ? (
                                  <span className="text-[10px] font-black text-orange-700 dark:text-orange-400 uppercase bg-orange-100 dark:bg-orange-900/30 px-3 py-1.5 rounded-2xl">
                                    {t.verySoon || t.critical}
                                  </span>
                                ) : hasSoon ? (
                                  <span className="text-[10px] font-black text-yellow-700 dark:text-yellow-400 uppercase bg-yellow-100 dark:bg-yellow-900/30 px-3 py-1.5 rounded-2xl">
                                    {t.soon}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-black text-teal-950 dark:text-teal-50 uppercase bg-[#94D2BD] dark:bg-[#94D2BD]/80 px-3 py-1.5 rounded-2xl">
                                    {t.safe}
                                  </span>
                                )}
                                
                              </div>
                              </motion.div>
                              {index !== arr.length - 1 && (
                                <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-700 to-transparent z-20"></div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {medicines.length > 0 && (
                  <div className="flex justify-start mt-6 rtl:justify-end">
                    <button
                      onClick={clearAllMedicines}
                      className="px-4 py-2 border-2 border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:border-red-600 dark:hover:border-red-400 transition-colors flex items-center justify-center gap-2 text-xs font-bold uppercase  rounded-2xl"
                      aria-label="Clear all"
                      title={t.clearAll}
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>{t.clearAll}</span>
                    </button>
                  </div>
                )}
                {medicines.length > 0 && (
                  <div className="mt-8 flex flex-col sm:flex-row sm:items-end justify-between gap-6 border-t border-slate-200 dark:border-slate-800 pt-6">
                    <div className="flex flex-col gap-4 shrink-0 w-full sm:w-auto ml-auto rtl:mr-auto rtl:ml-0">
                      <div className="flex flex-col gap-1">
                        <label className={`text-xs font-bold text-slate-500 uppercase  ${textAlign}`} dir={textDir}>
                          {t.employeeNameLabel || "Check by"}
                        </label>
                        <input
                          type="text"
                          value={employeeName}
                          onChange={(e) => setEmployeeName(e.target.value)}
                          placeholder={
                            t.employeeNamePlaceholder || "أدخل الاسم"
                          }
                          className={`w-full bg-white dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 rounded-2xl py-3 px-4 font-bold text-sm outline-none focus:border-slate-900 dark:focus:border-white transition-colors placeholder:font-medium placeholder:text-slate-400 ${textAlign} ${lang === 'ar' ? 'placeholder:text-right' : 'placeholder:text-left'}`} dir={textDir}
                        />
                        <div className={`mt-2 flex items-center ${lang === 'ar' ? 'justify-end' : 'justify-end'} gap-2 ${textAlign}`} dir={textDir}>
                           <div className="relative flex items-center justify-center">
                             <input type="file" accept="image/*" onChange={(e) => {
                               const file = e.target.files?.[0];
                               if (file) {
                                 const reader = new FileReader();
                                 reader.onload = (ev) => setReportLogo(ev.target?.result as string);
                                 reader.readAsDataURL(file);
                               }
                             }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" title={lang === "ar" ? "إضافة شعار للتقرير" : "Add Logo to Report"} />
                             <button type="button" className="h-7 px-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center gap-1.5 relative z-0 shrink-0 font-bold text-[10px] uppercase" title={lang === "ar" ? "إضافة شعار للتقرير" : "Add Logo to Report"}>
                               <span>{lang === "ar" ? "شعار" : "Logo"}</span>
                             </button>
                           </div>
                           {reportLogo && (
                             <div className="relative inline-flex items-start">
                               <img src={reportLogo} alt="Logo" className="h-7 object-contain rounded" />
                               <button type="button" onClick={() => setReportLogo(null)} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 z-20">
                                 <X className="w-2.5 h-2.5" />
                               </button>
                             </div>
                           )}
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                        <button
                          onClick={() => {
                            const success = exportToCSV(medicines, lang);
                            if (!success) showError(t.noDataToExport);
                          }}
                          className="flex items-center justify-center space-x-2 space-x-reverse bg-slate-900 dark:bg-slate-800 text-white dark:text-white px-4 py-3 font-bold text-xs uppercase  hover:bg-slate-800 dark:hover:opacity-90 transition-colors rounded-2xl"
                        >
                          <Download className="w-4 h-4 rtl:ml-2 ltr:mr-2" />
                          <span>{t.exportToExcel}</span>
                        </button>
                        <button
                          id="btn-export-pdf" onClick={async () => {
                            const success = await exportToPDF(
                              medicines,
                              currentProject?.name || null,
                              employeeName,
                              lang,
                              reportLogo
                            );
                            if (!success) showError(t.noDataToExport);
                          }}
                          className="flex items-center justify-center space-x-2 space-x-reverse border-2 border-slate-900 dark:border-white text-slate-900 dark:text-white px-4 py-3 font-bold text-xs uppercase  hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors rounded-2xl"
                        >
                          <Download className="w-4 h-4 rtl:ml-2 ltr:mr-2" />
                          <span>{t.exportToPDF}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeStep === "capture-details" && (
              <motion.div
                key="capture-details"
                
                
              >
                <CameraCapture
                  title={t.captureDetailsTitle}
                  lang={lang}
                  onCapture={handleCaptureDetails}
                  onCancel={() => setActiveStep("list")}
                />
              </motion.div>
            )}

            {activeStep === "capture-expiry" && (
              <motion.div
                key="capture-expiry"
                
                
              >
                <CameraCapture
                  title={t.captureExpiryTitle}
                  lang={lang}
                  onCapture={handleCaptureExpiry}
                  onCancel={() => setActiveStep(scanSource === "edit" ? "edit-medicine" : "confirm-details")}
                />
              </motion.div>
            )}

            {activeStep === "confirm-details" && (
              <motion.div
                key="confirm-details"
                
                className="bg-white dark:bg-slate-950 p-6 lg:p-8 border-2 border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl mx-auto my-auto"
              >
                <h2 className={`text-3xl font-black uppercase mb-6 flex items-center gap-3 ${textAlign}`} dir={textDir}>
                  <Pill className="w-8 h-8 text-slate-900 dark:text-white" />
                  {t.confirmDetails}
                </h2>
                <div
                  className={`flex flex-col ${capturedImage && isOfflineMode ? "md:flex-row" : ""} gap-6`}
                >
                  <div className="flex-1 space-y-6">
                    <div>
                      <label className={`block text-xs font-black text-slate-400 dark:text-slate-500 uppercase  mb-2  ${textAlign}`} dir={textDir}>
                        {t.medicineName}
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={currentMed.name || ""}
                          onChange={(e) => {
                            setCurrentMed({ ...currentMed, name: e.target.value });
                            setShowNameSuggestions(true);
                          }}
                          onFocus={() => setShowNameSuggestions(true)}
                          onBlur={() => setTimeout(() => setShowNameSuggestions(false), 200)}
                          className="w-full bg-white dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-4 font-bold text-lg outline-none focus:border-slate-900 dark:focus:border-white transition-colors placeholder:font-medium placeholder:text-slate-400"
                          placeholder={t.medicineNamePlaceholder}
                          dir="ltr"
                         
                        />
                        {showNameSuggestions && nameSuggestions.length > 0 && (
                          <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 max-h-48 overflow-y-auto shadow-xl" dir="ltr">
                            {nameSuggestions.map((name, i) => (
                              <div
                                key={i}
                                onMouseDown={(e) => {
                                  e.preventDefault(); // Prevent blur
                                  setCurrentMed({ ...currentMed, name });
                                  setShowNameSuggestions(false);
                                }}
                                className="px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer font-bold border-b border-slate-100 dark:border-slate-800 last:border-0"
                              >
                                {name}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {capturedImage && isOfflineMode && (
                    <div className="w-full md:w-1/2 flex flex-col gap-4">
                      <div>
                        <label className={`block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase  mb-2  ${textAlign}`} dir={textDir}>
                          {t.capturedImageTitle}
                        </label>
                        <img
                          src={capturedImage}
                          alt="Captured"
                          className="w-full h-48 object-contain bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl"
                        />
                      </div>

                      <div className="flex-1 flex flex-col gap-2">
                        <div className="flex-1 flex flex-col">
                          <label className={`block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase  mb-1 flex items-center justify-between  ${textAlign}`} dir={textDir}>
                            {t.ocrExtractedText}
                            {isOcrProcessing && (
                              <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                            )}
                          </label>
                          <textarea
                            readOnly
                            value={
                              isOcrProcessing ? t.ocrProcessing : ocrText || ""
                            }
                            className="w-full flex-1 min-h-[60px] bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 p-2 text-xs font-mono text-slate-600 dark:text-slate-400 outline-none resize-none"
                           
                          />
                        </div>
                        <div className="flex-1 flex flex-col">
                          <label className={`block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase  mb-1 flex items-center justify-between  ${textAlign}`} dir={textDir}>
                            {t.barcodeFound}
                            {isBarcodeProcessing && (
                              <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                            )}
                          </label>
                          <textarea
                            readOnly
                            value={
                              isBarcodeProcessing
                                ? t.barcodeProcessing
                                : barcodeText || t.barcodeNoDate
                            }
                            className="w-full flex-1 min-h-[50px] bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 p-2 text-xs font-mono text-slate-600 dark:text-slate-400 outline-none resize-none"
                           
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setActiveStep("scan-barcode")}
                  className="w-full mt-6 bg-slate-900 dark:bg-white text-white dark:text-slate-950 py-4 font-black uppercase  flex items-center justify-center gap-3 hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors text-sm rounded-2xl"
                >
                  <ScanLine className="w-5 h-5" />
                  {lang === 'ar' ? 'مسح' : 'Scan'}
                  <ArrowRight className="w-5 h-5 rtl:rotate-180 ml-2" />
                </button>
              </motion.div>
            )}

            {activeStep === "scan-barcode" && (
              <motion.div
                key="scan-barcode"
                
                
              >
               <BarcodeScanner
                 lang={lang}
                 onScan={handleScanBarcode}
                 onCancel={() => {
                   if (scanSource === "edit") setActiveStep("edit-medicine");
                   else if (currentMed.name || currentMed.batchInfo || currentMed.expiryDates?.length > 0) setActiveStep("confirm-details");
                   else setActiveStep("list");
                 }}
               />
              </motion.div>
            )}

            {activeStep === "confirm-expiry" && (
              <motion.div
                key="confirm-expiry"
                
                className="bg-white dark:bg-slate-950 p-6 lg:p-8 border-2 border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl mx-auto my-auto"
              >
                <h2 className={`text-3xl font-black uppercase mb-6 flex items-center gap-3 ${textAlign}`} dir={textDir}>
                  <CalendarIcon className="w-8 h-8 text-slate-900 dark:text-white" />
                  {t.confirmExpiry}
                </h2>

                <div className="bg-slate-50 dark:bg-slate-900 p-6 border-l-4 border-slate-300 dark:border-slate-700 mb-6 rtl:border-r-4 rtl:border-l-0">
                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase  mb-1">
                    {t.currentMedicine}
                  </p>
                  <p className="font-black text-xl">
                    {currentMed.name}
                  </p>
                  {currentMed.expiryDates &&
                    currentMed.expiryDates.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                        <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase  mb-2">
                          {t.previouslyAddedDates}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {currentMed.expiryDates.map((date, i) => (
                            <div
                              key={i}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-slate-200 dark:bg-slate-800 rounded-2xl"
                            >
                              <span className="text-xs font-black text-slate-600 dark:text-slate-400">
                                {date}
                              </span>
                              <button
                                onClick={() => removeExpiryDate(i)}
                                className="text-slate-400 hover:text-[#f2542d] transition-colors p-0.5"
                                title="حذف التاريخ"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>

                <div
                  className={`flex flex-col ${capturedImage && isOfflineMode ? "md:flex-row" : ""} gap-6`}
                >
                  <div className="flex-1">
                    <label className={`block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase  mb-2  ${textAlign}`} dir={textDir}>
                      {t.extractedExpiryDate}
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={
                          currentExpiryDate
                            ? currentExpiryDate.split("-")[1] || ""
                            : ""
                        }
                        onChange={(e) => {
                          const month = e.target.value;
                          let year = currentExpiryDate
                            ? currentExpiryDate.split("-")[0]
                            : "";
                          if (!year) year = String(CURRENT_YEAR);
                          const d = new Date(
                            Number(year),
                            Number(month),
                            0,
                          ).getDate();
                          setCurrentExpiryDate(
                            `${year}-${month}-${d.toString().padStart(2, "0")}`,
                          );
                        }}
                        className="flex-1 bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-6 font-black text-2xl text-center outline-none focus:border-slate-900 dark:focus:border-white transition-colors  cursor-pointer appearance-none"
                      >
                        <option value="" disabled>
                          {lang === "ar" ? "الشهر" : "MM"}
                        </option>
                        {MONTHS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                      <select
                        value={
                          currentExpiryDate
                            ? currentExpiryDate.split("-")[0] || ""
                            : ""
                        }
                        onChange={(e) => {
                          const year = e.target.value;
                          let month = currentExpiryDate
                            ? currentExpiryDate.split("-")[1]
                            : "";
                          if (!month) month = "01";
                          const d = new Date(
                            Number(year),
                            Number(month),
                            0,
                          ).getDate();
                          setCurrentExpiryDate(
                            `${year}-${month}-${d.toString().padStart(2, "0")}`,
                          );
                        }}
                        className="flex-1 bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-6 font-black text-2xl text-center outline-none focus:border-slate-900 dark:focus:border-white transition-colors  cursor-pointer appearance-none"
                      >
                        <option value="" disabled>
                          {lang === "ar" ? "العام" : "YYYY"}
                        </option>
                        {YEARS.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {capturedImage && isOfflineMode && (
                    <div className="w-full md:w-1/2 flex flex-col gap-4">
                      <div>
                        <label className={`block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase  mb-2  ${textAlign}`} dir={textDir}>
                          {t.capturedImageTitle}
                        </label>
                        <img
                          src={capturedImage}
                          alt="Captured"
                          className="w-full h-48 object-contain bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl"
                        />
                      </div>

                      <div className="flex-1 flex flex-col gap-2">
                        <div className="flex-1 flex flex-col">
                          <label className={`block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase  mb-1 flex items-center justify-between  ${textAlign}`} dir={textDir}>
                            {t.ocrExtractedText}
                            {isOcrProcessing && (
                              <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                            )}
                          </label>
                          <textarea
                            readOnly
                            value={
                              isOcrProcessing ? t.ocrProcessing : ocrText || ""
                            }
                            className="w-full flex-1 min-h-[60px] bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 p-2 text-xs font-mono text-slate-600 dark:text-slate-400 outline-none resize-none"
                           
                          />
                        </div>
                        <div className="flex-1 flex flex-col">
                          <label className={`block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase  mb-1 flex items-center justify-between  ${textAlign}`} dir={textDir}>
                            {t.barcodeFound}
                            {isBarcodeProcessing && (
                              <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                            )}
                          </label>
                          <textarea
                            readOnly
                            value={
                              isBarcodeProcessing
                                ? t.barcodeProcessing
                                : barcodeText || t.barcodeNoDate
                            }
                            className="w-full flex-1 min-h-[50px] bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 p-2 text-xs font-mono text-slate-600 dark:text-slate-400 outline-none resize-none"
                           
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-6 space-y-4">
                  <button
                    onClick={() => handleSaveExpiry(true)}
                    className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-950 py-4 font-black uppercase  flex items-center justify-center gap-3 hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors text-sm rounded-2xl"
                  >
                    <Check className="w-5 h-5" />
                    {scanSource === "edit" ? (lang === "ar" ? "تأكيد والرجوع" : "Confirm & Return") : t.saveAndFinish}
                  </button>
                  <button
                    onClick={() => handleSaveExpiry(false)}
                    className="w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-white border-2 border-slate-200 dark:border-slate-800 py-4 font-black uppercase  flex items-center justify-center gap-3 hover:border-slate-900 dark:hover:border-white transition-colors text-sm rounded-2xl"
                  >
                    <Plus className="w-5 h-5" />
                    {t.addAnotherDate}
                  </button>
                </div>
              </motion.div>
            )}
            {activeStep === "edit-medicine" && (
              <motion.div
                key="edit-medicine"
                
                className="max-w-2xl mx-auto w-full flex flex-col h-full"
              >
                <h2 className={`text-2xl font-black mb-6 uppercase ${textAlign}`} dir={textDir}>
                  {lang === "ar"
                    ? "إضافة/تعديل بيانات الدواء"
                    : "Add/Edit Medicine Details"}
                </h2>

                <div className="flex-1 space-y-8">
                  <div>
                    <label className={`block text-xs font-black text-slate-400 dark:text-slate-500 uppercase  mb-2  ${textAlign}`} dir={textDir}>
                        {t.medicineName}
                      </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={currentMed.name || ""}
                        onChange={(e) => {
                          setCurrentMed({ ...currentMed, name: e.target.value });
                          setShowNameSuggestions(true);
                        }}
                        onFocus={() => setShowNameSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowNameSuggestions(false), 200)}
                        className="w-full bg-white dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 rounded-2xl p-4 font-bold text-xl outline-none focus:border-slate-900 dark:focus:border-white transition-colors placeholder:font-medium placeholder:text-slate-400"
                       
                      />
                      {showNameSuggestions && nameSuggestions.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 max-h-48 overflow-y-auto shadow-xl">
                          {nameSuggestions.map((name, i) => (
                            <div
                              key={i}
                              onMouseDown={(e) => {
                                e.preventDefault(); // Prevent blur
                                setCurrentMed({ ...currentMed, name });
                                setShowNameSuggestions(false);
                              }}
                              className="px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer font-bold border-b border-slate-100 dark:border-slate-800 last:border-0"
                            >
                              {name}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className={`block text-xs font-black text-slate-400 dark:text-slate-500 uppercase  mb-2  ${textAlign}`} dir={textDir}>
                      {t.previouslyAddedDates}
                    </label>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {(currentMed.expiryDates || []).map((date, i) => {
                        const status = getStatus(date);
                        let chipColor =
                                    "bg-[#94D2BD] dark:bg-[#94D2BD]/80 text-teal-950 dark:text-teal-50";
                        if (status === "expired") {
                          chipColor =
                            "bg-red-200 dark:bg-red-900/60 text-red-900 dark:text-red-300";
                        } else if (status === "very_soon") {
                          chipColor =
                            "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400";
                        } else if (status === "soon") {
                          chipColor =
                            "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400";
                        }

                        return (
                          <div
                            key={i}
                            className={`inline-flex items-center gap-1 px-3 py-2 rounded-2xl ${chipColor}`}
                          >
                            <span className="text-sm font-black">
                              {date}
                            </span>
                            <button
                              onClick={() => removeExpiryDate(i)}
                              className="opacity-50 hover:opacity-100 hover:text-[#f2542d] transition-all p-0.5"
                              title={
                                lang === "ar" ? "حذف التاريخ" : "Delete date"
                              }
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    <label className={`block text-xs font-black text-slate-400 dark:text-slate-500 uppercase  mb-2  ${textAlign}`} dir={textDir}>
                      {lang === "ar" ? "إضافة تاريخ جديد" : "Add New Date"}
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={
                          currentExpiryDate
                            ? currentExpiryDate.split("-")[1] || ""
                            : ""
                        }
                        onChange={(e) => {
                          const month = e.target.value;
                          let year = currentExpiryDate
                            ? currentExpiryDate.split("-")[0]
                            : "";
                          if (!year) year = String(CURRENT_YEAR);
                          const d = new Date(
                            Number(year),
                            Number(month),
                            0,
                          ).getDate();
                          setCurrentExpiryDate(
                            `${year}-${month}-${d.toString().padStart(2, "0")}`,
                          );
                        }}
                        className="flex-1 bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl p-4 font-black outline-none focus:border-slate-900 dark:focus:border-white transition-colors cursor-pointer appearance-none text-center"
                      >
                        <option value="" disabled>
                          {lang === "ar" ? "الشهر" : "MM"}
                        </option>
                        {MONTHS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                      <select
                        value={
                          currentExpiryDate
                            ? currentExpiryDate.split("-")[0] || ""
                            : ""
                        }
                        onChange={(e) => {
                          const year = e.target.value;
                          let month = currentExpiryDate
                            ? currentExpiryDate.split("-")[1]
                            : "";
                          if (!month) month = "01";
                          const d = new Date(
                            Number(year),
                            Number(month),
                            0,
                          ).getDate();
                          setCurrentExpiryDate(
                            `${year}-${month}-${d.toString().padStart(2, "0")}`,
                          );
                        }}
                        className="flex-1 bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl p-4 font-black outline-none focus:border-slate-900 dark:focus:border-white transition-colors cursor-pointer appearance-none text-center"
                      >
                        <option value="" disabled>
                          {lang === "ar" ? "العام" : "YYYY"}
                        </option>
                        {YEARS.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => {
                          if (currentExpiryDate) {
                            setCurrentMed({
                              ...currentMed,
                              expiryDates: [
                                ...(currentMed.expiryDates || []),
                                currentExpiryDate,
                              ],
                            });
                            setCurrentExpiryDate("");
                          }
                        }}
                        className="bg-slate-900 dark:bg-white text-white dark:text-slate-950 px-4 font-black uppercase  flex items-center justify-center hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors rounded-2xl"
                      >
                        <Plus className="w-6 h-6" />
                      </button>
                      <button
                        onClick={() => {
                           setScanSource("edit");
                           setActiveStep("scan-barcode");
                        }}
                        title={lang === "ar" ? "مسح الباركود لاستخراج التاريخ" : "Scan barcode for date"}
                        className="bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white px-4 font-black uppercase  flex items-center justify-center hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors rounded-2xl"
                      >
                        <ScanLine className="w-6 h-6" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-6 space-y-4">
                  <button
                    onClick={() => {
                      let updatedMed = { ...currentMed };
                      if (
                        currentExpiryDate &&
                        currentExpiryDate.trim() !== ""
                      ) {
                        updatedMed.expiryDates = [
                          ...(updatedMed.expiryDates || []),
                          currentExpiryDate,
                        ];
                      }
                      updateMedicines((prev) => {
                        const exists = prev.some((m) => m.id === updatedMed.id);
                        if (exists) {
                          return prev.map((m) =>
                            m.id === updatedMed.id
                              ? (updatedMed as Medicine)
                              : m,
                          );
                        }
                        return [...prev, updatedMed as Medicine];
                      });
                      setCurrentMed({});
                      setCurrentExpiryDate("");
                      setActiveStep("list");
                    }}
                    disabled={!currentMed.name}
                    className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-950 py-4 font-black uppercase  flex items-center justify-center gap-3 hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl"
                  >
                    <Check className="w-5 h-5" />
                    {lang === "ar" ? "حفظ التعديلات" : "Save Changes"}
                  </button>
                  <button
                    onClick={() => {
                      setCurrentMed({});
                      setCurrentExpiryDate("");
                      setActiveStep("list");
                    }}
                    className="w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-white border-2 border-slate-200 dark:border-slate-800 py-4 font-black uppercase  flex items-center justify-center gap-3 hover:border-slate-900 dark:hover:border-white transition-colors text-sm rounded-2xl"
                  >
                    {lang === "ar" ? "إلغاء" : "Cancel"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence mode="wait">
            {errorMessage && (
              <motion.div
                
                className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-4 rounded-2xl font-bold uppercase  text-sm z-50 border-2 border-slate-900"
              >
                {errorMessage}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Loading Overlay */}
        <AnimatePresence mode="wait">
          {isAnalyzing && (
            <motion.div
              
              className="fixed inset-0 bg-slate-900/90 z-50 flex flex-col items-center justify-center text-white"
            >
              <Loader2 className="w-12 h-12 animate-spin mb-6" />
              <p className="text-xl font-black uppercase  animate-pulse mb-6">
                {t.analyzingImage}
              </p>
              <button
                onClick={() => {
                  if (abortControllerRef.current) {
                    abortControllerRef.current.abort("User cancelled");
                  }
                  setIsAnalyzing(false);
                  setActiveStep("list");
                }}
                className="group p-3 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors mt-4"
                title={lang === "ar" ? "إلغاء التحليل" : "Cancel Analysis"}
              >
                <X className="w-5 h-5 text-[#f2542d]" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Clear All Confirmation Modal */}
        <AnimatePresence mode="wait">
          {showClearConfirm && (
            <motion.div
              
              className="fixed inset-0 bg-slate-900/80 z-50 flex flex-col items-center justify-center p-4"
            >
              <motion.div
                
                className="bg-white dark:bg-slate-900 p-6 max-w-md w-full border-2 border-slate-200 dark:border-slate-800 rounded-2xl"
                dir={dir}
              >
                <div className="flex items-center gap-4 text-red-600 dark:text-red-400 mb-6">
                  <Trash2 className="w-8 h-8" />
                  <h3 className={`text-2xl font-black uppercase ${textAlign}`} dir={textDir}>
                    {t.clearAll}
                  </h3>
                </div>
                <p className="text-slate-600 dark:text-slate-400 text-lg mb-6 font-medium">
                  {t.clearAllConfirm}
                </p>
                <div className="flex gap-4">
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="flex-1 px-4 py-3 border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold uppercase  hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors rounded-2xl"
                  >
                    {t.cancel}
                  </button>
                  <button
                    onClick={() => {
                      updateMedicines([]);
                      setShowClearConfirm(false);
                    }}
                    className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-bold uppercase  transition-colors rounded-2xl"
                  >
                    {t.clearAll}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Reference DB Modal */}
        <AnimatePresence mode="wait">
          {showReferenceDbModal && (
            <motion.div
              
              className="fixed inset-0 bg-slate-900/80 z-50 flex flex-col items-center justify-center p-4"
            >
              <motion.div
                
                className="bg-white dark:bg-slate-900 p-6 max-w-md w-full border-2 border-slate-200 dark:border-slate-800 rounded-2xl relative"
                dir={dir}
              >
                <button
                  onClick={() => setShowReferenceDbModal(false)}
                  className="absolute top-4 right-4 rtl:right-auto rtl:left-4 p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>

                <div className="flex items-center gap-4 text-slate-900 dark:text-white mb-6">
                  <Database className="w-8 h-8" />
                  <h3 className={`text-xl font-black uppercase ${textAlign}`} dir={textDir}>
                    {lang === "ar" ? "قاعدة البيانات المرجعية" : "Reference Database"}
                  </h3>
                </div>

                <p className="text-slate-600 dark:text-slate-400 text-sm mb-6 font-medium leading-relaxed">
                  {lang === "ar" 
                    ? "قم برفع ملف Excel/CSV يحتوي على (Drug, Lot Number). سيتم استخدام هذه البيانات للتعرف التلقائي على اسم الدواء عند مسح الباركود."
                    : "Upload an Excel/CSV file containing (Drug, Lot Number). This data will be used to auto-fill the drug name when scanning a barcode."}
                </p>

                <div className="mb-6 bg-slate-100 dark:bg-slate-800 p-4 border-2 border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <span className="font-bold text-slate-700 dark:text-slate-300">
                    {lang === "ar" ? "الأدوية المسجلة:" : "Records:"}
                  </span>
                  <span className="font-black text-xl text-blue-600 dark:text-blue-400">
                    {referenceDb.length}
                  </span>
                </div>

                <div className="flex flex-col gap-4">
                  <label className={`flex-1 px-4 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-950 font-black text-sm uppercase  transition-colors rounded-2xl cursor-pointer text-center flex items-center justify-center gap-3 hover:opacity-90  ${textAlign}`} dir={textDir}>
                    <Upload className="w-5 h-5" />
                    <span>{lang === "ar" ? "رفع ملف (CSV, Excel, JSON)" : "Upload File"}</span>
                    <input type="file"
                      accept=".json,.csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                      className={`hidden  ${textAlign}`} dir={textDir}
                      onClick={(e) => {
                        if (referenceDb.length > 0) {
                          if (!window.confirm(lang === "ar" ? "توجد بيانات مسجلة مسبقاً. هل تريد المتابعة واستبدالها؟" : "Existing data found. Do you want to proceed and replace it?")) {
                            e.preventDefault();
                          }
                        }
                      }}
                      onChange={handleReferenceDbUpload}
                    />
                  </label>

                  {referenceDb.length > 0 && (
                    <button
                      onClick={() => {
                        if (confirm(lang === "ar" ? "هل أنت متأكد من مسح جميع البيانات المرجعية؟" : "Are you sure you want to clear all reference data?")) {
                          setReferenceDb([]);
                        }
                      }}
                      className="flex-1 px-4 py-4 border-2 border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 font-bold uppercase  hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center justify-center gap-3 rounded-2xl"
                    >
                      <Trash2 className="w-5 h-5" />
                      <span>{lang === "ar" ? "مسح قاعدة البيانات" : "Clear Database"}</span>
                    </button>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading Overlay */}
        {isUploadingDb && (
          <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 p-6 w-full max-w-sm flex flex-col items-center text-center space-y-4">
              <h2 className="text-xl font-bold">{lang === "ar" ? "جاري قراءة الملف..." : "Reading File..."}</h2>
              <div className="w-full bg-slate-200 dark:bg-slate-800 h-2">
                <div className="bg-slate-900 dark:bg-white h-full transition-all duration-300" style={{ width: `${uploadDbProgress}%` }}></div>
              </div>
              <p className="text-sm font-mono text-slate-500">{uploadDbProgress}%</p>
            </div>
          </div>
        )}

        {/* Confirmation Overlay */}
        {pendingUploadData && (
          <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 p-6 w-full max-w-sm flex flex-col items-center text-center space-y-6">
              <h2 className="text-2xl font-black">{lang === "ar" ? "تمت القراءة بنجاح" : "File read successfully"}</h2>
              <p className="text-slate-600 dark:text-slate-400 font-medium leading-relaxed">
                {lang === "ar" 
                  ? `تم العثور على ${pendingUploadData.length} عنصر. هل تريد المتابعة وتحديث قاعدة البيانات؟` 
                  : `Found ${pendingUploadData.length} items. Do you want to continue and update the database?`}
              </p>
              <div className="flex gap-4 w-full">
                <button 
                  onClick={confirmUpload}
                  className="flex-1 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black tracking-wide uppercase hover:opacity-90 transition-opacity rounded-2xl"
                >
                  {lang === "ar" ? "نعم، متابعة" : "Yes, Update"}
                </button>
                <button 
                  onClick={() => setPendingUploadData(null)}
                  className="flex-1 py-3 border-2 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-bold tracking-wide uppercase hover:border-slate-900 dark:hover:border-white transition-colors rounded-2xl"
                >
                  {lang === "ar" ? "إلغاء" : "Cancel"}
                </button>
              </div>
            </div>
          </div>
        )}


        {/* Medicine Delete Confirmation Overlay */}
        {medicineToDelete && (
          <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white dark:bg-slate-900 p-6 w-full max-w-sm flex flex-col items-center text-center space-y-6 rounded-2xl border-2 border-slate-200 dark:border-slate-800"
              dir={lang === "ar" ? "rtl" : "ltr"}
            >
              <h2 className="text-xl font-black">{lang === "ar" ? "تأكيد الحذف" : "Confirm Deletion"}</h2>
              <p className="text-slate-600 dark:text-slate-400 font-medium leading-relaxed">
                {lang === "ar" 
                  ? `هل أنت متأكد من حذف الدواء "${medicineToDelete.name}"؟`
                  : `Are you sure you want to delete "${medicineToDelete.name}"?`}
              </p>
              <div className="flex gap-4 w-full">
                <button 
                  onClick={() => setMedicineToDelete(null)}
                  className="flex-1 py-3 border-2 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-bold tracking-wide uppercase hover:border-slate-900 dark:hover:border-white transition-colors rounded-2xl"
                >
                  {lang === "ar" ? "إلغاء" : "Cancel"}
                </button>
                <button 
                  onClick={() => {
                    deleteMedicine(medicineToDelete.id);
                    setMedicineToDelete(null);
                  }}
                  className="flex-1 py-3 bg-[#f2542d] text-white font-black tracking-wide uppercase hover:opacity-90 transition-opacity rounded-2xl"
                >
                  {lang === "ar" ? "نعم، احذف" : "Yes, Delete"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
