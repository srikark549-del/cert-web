import React from 'react';
import { CertificateTemplate, TemplateFieldConfig } from '../../types';
import { Award, ShieldCheck, QrCode } from 'lucide-react';

interface CertificatePreviewCanvasProps {
  template: CertificateTemplate;
  sampleData?: {
    name?: string;
    email?: string;
    studentId?: string;
    rollNumber?: string;
    eventName?: string;
    date?: string;
    certificateId?: string;
  };
  selectedFieldId?: string | null;
  onSelectField?: (fieldId: string) => void;
  interactive?: boolean;
}

export const CertificatePreviewCanvas: React.FC<CertificatePreviewCanvasProps> = ({
  template,
  sampleData = {
    name: 'Purna Sai Avvaru',
    email: 'purna@gmail.com',
    studentId: 'STU-2026-0891',
    rollNumber: '22CS0891',
    eventName: 'PyCore 2026 — Advanced Data & AI Summit',
    date: 'September 24, 2026',
    certificateId: 'CERT-PYC-2026-001',
  },
  selectedFieldId = null,
  onSelectField,
  interactive = false,
}) => {
  const getFieldValue = (field: TemplateFieldConfig): string => {
    switch (field.fieldKey) {
      case 'NAME':
        return sampleData.name || 'Purna Sai Avvaru';
      case 'EVENT_NAME':
        return sampleData.eventName || 'PyCore 2026 — Advanced Data & AI Summit';
      case 'CERTIFICATE_ID':
        return sampleData.certificateId || 'CERT-PYC-2026-001';
      case 'DATE':
        return sampleData.date || 'September 24, 2026';
      case 'ROLL_NO':
        return `Roll No: ${sampleData.rollNumber || '22CS0891'}`;
      case 'STUDENT_ID':
        return `Student ID: ${sampleData.studentId || 'STU-2026-0891'}`;
      case 'EMAIL':
        return sampleData.email || 'purna@gmail.com';
      default:
        return field.placeholder;
    }
  };

  return (
    <div className="relative w-full aspect-[1.414/1] bg-white text-slate-900 rounded-lg shadow-2xl overflow-hidden border border-slate-300 select-none">
      {/* Decorative Guilloche / Border Frame */}
      <div className="absolute inset-3 border-4 border-double border-indigo-900/60 rounded pointer-events-none" />
      <div className="absolute inset-5 border border-amber-600/40 rounded pointer-events-none" />
      
      {/* Corner Ornaments */}
      <div className="absolute top-6 left-6 w-12 h-12 border-t-2 border-l-2 border-amber-600 pointer-events-none" />
      <div className="absolute top-6 right-6 w-12 h-12 border-t-2 border-r-2 border-amber-600 pointer-events-none" />
      <div className="absolute bottom-6 left-6 w-12 h-12 border-b-2 border-l-2 border-amber-600 pointer-events-none" />
      <div className="absolute bottom-6 right-6 w-12 h-12 border-b-2 border-r-2 border-amber-600 pointer-events-none" />

      {/* Subtle Background Watermark */}
      <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none">
        <Award className="w-96 h-96 text-indigo-950" />
      </div>

      {/* Header Badge & Brand */}
      <div className="absolute top-10 inset-x-0 flex flex-col items-center pointer-events-none">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white">
            <Award className="w-3.5 h-3.5" />
          </div>
          <span className="font-mono text-[10px] tracking-widest uppercase font-semibold text-indigo-950">
            Synapse × WiDS Certification Secretariat
          </span>
        </div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-wider text-indigo-950 uppercase font-serif">
          Certificate of Completion
        </h2>
        <p className="text-[11px] uppercase tracking-widest text-amber-700 font-semibold mt-0.5">
          This is proudly presented to
        </p>
      </div>

      {/* Dynamic Fields Layer */}
      {template.fields
        .filter((f) => f.visible)
        .map((field) => {
          const isSelected = selectedFieldId === field.id;
          const val = getFieldValue(field);

          return (
            <div
              key={field.id}
              onClick={(e) => {
                if (interactive && onSelectField) {
                  e.stopPropagation();
                  onSelectField(field.id);
                }
              }}
              style={{
                position: 'absolute',
                left: `${field.xPercent}%`,
                top: `${field.yPercent}%`,
                transform:
                  field.textAlign === 'center'
                    ? 'translate(-50%, -50%)'
                    : field.textAlign === 'right'
                    ? 'translate(-100%, -50%)'
                    : 'translate(0, -50%)',
                fontSize: `${field.fontSize * 0.75}px`,
                fontWeight: field.fontWeight,
                fontFamily: field.fontFamily,
                color: field.color,
                textAlign: field.textAlign,
                cursor: interactive ? 'pointer' : 'default',
              }}
              className={`transition-all ${
                interactive
                  ? 'hover:ring-2 hover:ring-purple-400 hover:ring-offset-2 p-1 rounded'
                  : ''
              } ${
                isSelected
                  ? 'ring-2 ring-purple-600 ring-offset-2 bg-purple-50/50 shadow-sm'
                  : ''
              }`}
            >
              {val}
              {interactive && isSelected && (
                <span className="absolute -top-4 left-1/2 -translate-x-1/2 px-1 py-0.2 bg-purple-600 text-[9px] font-sans text-white rounded shadow uppercase">
                  {field.placeholder}
                </span>
              )}
            </div>
          );
        })}

      {/* Description text under name */}
      <div className="absolute top-[52%] inset-x-16 text-center pointer-events-none">
        <p className="text-[11px] sm:text-xs text-slate-600 leading-relaxed max-w-xl mx-auto">
          for active participation, diligent attendance, and successfully fulfilling the academic
          and practical workshop modules during the international symposium.
        </p>
      </div>

      {/* Signatures and Official Seals Footer */}
      <div className="absolute bottom-12 inset-x-12 flex justify-between items-end pointer-events-none">
        {/* Left Signature */}
        <div className="text-center w-36">
          <div className="font-['Great_Vibes'] text-xl text-indigo-900 border-b border-slate-400 pb-0.5 mb-1">
            Elena Rostova
          </div>
          <p className="text-[9px] font-bold text-slate-800 uppercase tracking-wider">
            Dr. Elena Rostova
          </p>
          <p className="text-[8px] text-slate-500">Program Chair & Director</p>
        </div>

        {/* Center Official Gold Seal */}
        <div className="flex flex-col items-center">
          <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-300 shadow-md border-2 border-white flex items-center justify-center text-amber-950 relative">
            <ShieldCheck className="w-7 h-7" />
            <div className="absolute -bottom-2 flex gap-1">
              <div className="w-2.5 h-4 bg-amber-600 clip-ribbon transform -rotate-12" />
              <div className="w-2.5 h-4 bg-amber-600 clip-ribbon transform rotate-12" />
            </div>
          </div>
          <span className="text-[8px] font-bold uppercase tracking-widest text-amber-800 mt-2 font-mono">
            OFFICIAL VERIFIED
          </span>
        </div>

        {/* Right Signature & QR */}
        <div className="text-center w-36">
          <div className="font-['Great_Vibes'] text-xl text-indigo-900 border-b border-slate-400 pb-0.5 mb-1">
            Marcus Thorne
          </div>
          <p className="text-[9px] font-bold text-slate-800 uppercase tracking-wider">
            Prof. Marcus Thorne
          </p>
          <p className="text-[8px] text-slate-500">Dean of Computing</p>
        </div>
      </div>

      {/* Tiny verification footer string */}
      <div className="absolute bottom-4 inset-x-8 flex justify-between items-center text-[8px] text-slate-400 font-mono pointer-events-none">
        <div className="flex items-center gap-1">
          <QrCode className="w-3 h-3 text-slate-500" />
          <span>Scan or visit /verify to validate authentic digital signature</span>
        </div>
        <span>Security standard: SHA-256 Vector Signed</span>
      </div>
    </div>
  );
};
