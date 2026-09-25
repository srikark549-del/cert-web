import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Filter,
  Check,
  Search,
  ChevronRight,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { ColumnMapping, ImportJob, Participant } from '../../types';
import { importsService } from '../../api/imports';
import { Badge } from '../../components/common/Badge';
import { useNotifications } from '../../context/NotificationContext';
import confetti from 'canvas-confetti';

export const ImportPreviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useNotifications();
  const [job, setJob] = useState<ImportJob | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCommitting, setIsCommitting] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ELIGIBLE' | 'NOT_ELIGIBLE'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Column mappings state
  const [mappings, setMappings] = useState<ColumnMapping[]>([
    { detectedColumn: 'Student Name', sampleValue: 'Purna Sai Avvaru', mappedField: 'name' },
    { detectedColumn: 'Mail ID', sampleValue: 'purna@gmail.com', mappedField: 'email' },
    { detectedColumn: 'Roll No.', sampleValue: '22CS0891', mappedField: 'rollNumber' },
    { detectedColumn: 'Student ID', sampleValue: 'STU-2026-0891', mappedField: 'studentId' },
    { detectedColumn: 'Entry Time', sampleValue: '09:05 AM', mappedField: 'checkIn' },
    { detectedColumn: 'Exit Time', sampleValue: '05:12 PM', mappedField: 'checkOut' },
  ]);

  useEffect(() => {
    setIsLoading(true);
    importsService.analyzeFile('job_attendance_01', mappings).then((res) => {
      setJob(res.data);
      setIsLoading(false);
    });
  }, []);

  const handleMappingChange = (index: number, newField: ColumnMapping['mappedField']) => {
    const updated = [...mappings];
    updated[index].mappedField = newField;
    setMappings(updated);
    showToast('info', 'Mapping Updated', `Mapped "${updated[index].detectedColumn}" to ${newField}`);
  };

  const handleConfirmImport = async () => {
    if (!job) return;
    setIsCommitting(true);

    try {
      const res = await importsService.commitImport(job.records);
      if (res.success) {
        confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
        showToast('success', 'Import Committed', `${res.data.importedCount} eligible certificates queued for review.`);
        navigate('/admin/certificates/pending');
      }
    } catch {
      showToast('error', 'Import Failed', 'Failed to commit participant records to database.');
    } finally {
      setIsCommitting(false);
    }
  };

  const filteredRecords = (job?.records || []).filter((r) => {
    if (activeFilter !== 'ALL' && r.eligibility !== activeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.rollNumber.toLowerCase().includes(q) ||
        r.studentId.toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (isLoading || !job) {
    return (
      <div className="p-16 text-center">
        <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <h3 className="text-base font-bold">Analyzing Attendance Records...</h3>
        <p className="text-xs text-slate-400 mt-1">Cross-referencing check-in and check-out timestamps against eligibility policy</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 text-xs font-semibold mb-2">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Step 2: Schema Mapping & Eligibility Verification</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Import Preview & Validation</h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Review column bindings, attendance eligibility results, and data validation flags.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/admin/import"
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Re-upload File
          </Link>
          <button
            onClick={handleConfirmImport}
            disabled={isCommitting}
            className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md shadow-purple-600/25 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {isCommitting ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Import Valid Records</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Validation Summary Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-[11px] text-slate-400 font-semibold uppercase">Total Records</span>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">{job.totalRecords}</p>
          <span className="text-[10px] text-slate-400">100% Parsed</span>
        </div>

        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 shadow-sm">
          <span className="text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold uppercase">Eligible</span>
          <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">{job.validRecords}</p>
          <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80">Ready for certificate</span>
        </div>

        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 shadow-sm">
          <span className="text-[11px] text-rose-700 dark:text-rose-300 font-semibold uppercase">Not Eligible</span>
          <p className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-1">{job.invalidRecords}</p>
          <span className="text-[10px] text-rose-600/80 dark:text-rose-400/80">Incomplete timestamps</span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-[11px] text-slate-400 font-semibold uppercase">Missing Check-in</span>
          <p className="text-2xl font-extrabold text-slate-800 dark:text-slate-200 mt-1">{job.missingCheckIn}</p>
          <span className="text-[10px] text-slate-400">No entry logged</span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-[11px] text-slate-400 font-semibold uppercase">Missing Check-out</span>
          <p className="text-2xl font-extrabold text-slate-800 dark:text-slate-200 mt-1">{job.missingCheckOut}</p>
          <span className="text-[10px] text-slate-400">Departed early / unlogged</span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-[11px] text-slate-400 font-semibold uppercase">Missing Emails</span>
          <p className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">{job.missingEmails}</p>
          <span className="text-[10px] text-slate-400">Warning flag</span>
        </div>
      </div>

      {/* Two Columns: Section 1 Column Mapping + Section 2 Eligibility Rule Banner */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column Mapping (2 cols) */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-base">Detected Column Mapping</h3>
              <p className="text-xs text-slate-400">Map uploaded spreadsheet headers to internal entity properties</p>
            </div>
            <span className="text-xs font-mono text-purple-600 bg-purple-50 dark:bg-purple-950 px-2 py-1 rounded">
              Auto-Matched
            </span>
          </div>

          <div className="space-y-2.5">
            {mappings.map((m, idx) => (
              <div
                key={idx}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 gap-2"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-purple-500" />
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 font-mono">
                      "{m.detectedColumn}"
                    </span>
                    <span className="text-[11px] text-slate-400 ml-2">Sample: {m.sampleValue}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Map to:</span>
                  <select
                    value={m.mappedField}
                    onChange={(e) =>
                      handleMappingChange(idx, e.target.value as ColumnMapping['mappedField'])
                    }
                    className="text-xs font-semibold py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  >
                    <option value="name">Name (&#123;&#123;NAME&#125;&#125;)</option>
                    <option value="email">Email (&#123;&#123;EMAIL&#125;&#125;)</option>
                    <option value="studentId">Student ID (&#123;&#123;STUDENT_ID&#125;&#125;)</option>
                    <option value="rollNumber">Roll Number (&#123;&#123;ROLL_NO&#125;&#125;)</option>
                    <option value="checkIn">Check-in Timestamp</option>
                    <option value="checkOut">Check-out Timestamp</option>
                    <option value="ignore">Ignore Column</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Eligibility Rule Card (1 col) */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3 text-purple-700 dark:text-purple-300">
              <ShieldAlert className="w-5 h-5 text-purple-600" />
              <h3 className="font-bold text-base">Active Eligibility Rule</h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Default institutional policy requires verified timestamps for{' '}
              <span className="font-bold text-purple-600 dark:text-purple-400">BOTH Check-in and Check-out</span>.
            </p>

            {/* Visual Example Card */}
            <div className="mt-4 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 text-[11px]">Rule Condition</span>
                <span className="text-slate-500 text-[11px]">Outcome</span>
              </div>
              <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
                <div>
                  <p>Check-in: ✓ Present</p>
                  <p>Check-out: ✓ Present</p>
                </div>
                <Badge status="ELIGIBLE" />
              </div>
              <div className="flex items-center justify-between text-rose-700 dark:text-rose-400 pt-2 border-t border-slate-200 dark:border-slate-700">
                <div>
                  <p>Check-in: ✓ Present</p>
                  <p>Check-out: ✗ Missing</p>
                </div>
                <Badge status="NOT_ELIGIBLE" />
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-purple-500 shrink-0" />
            <span>Configurable in Settings before final generation.</span>
          </div>
        </div>
      </div>

      {/* Records Table Section */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Table Toolbar */}
        <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                activeFilter === 'ALL'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              All Records ({job.totalRecords})
            </button>
            <button
              onClick={() => setActiveFilter('ELIGIBLE')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                activeFilter === 'ELIGIBLE'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              Eligible ({job.validRecords})
            </button>
            <button
              onClick={() => setActiveFilter('NOT_ELIGIBLE')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                activeFilter === 'NOT_ELIGIBLE'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              Not Eligible ({job.invalidRecords})
            </button>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in parsed records..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wider font-semibold text-[10px]">
              <tr>
                <th className="py-3 px-4">Participant Name</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Roll Number</th>
                <th className="py-3 px-4">Student ID</th>
                <th className="py-3 px-4">Check-in</th>
                <th className="py-3 px-4">Check-out</th>
                <th className="py-3 px-4">Eligibility Decision</th>
                <th className="py-3 px-4">Validation Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredRecords.slice(0, 50).map((r) => (
                <tr
                  key={r.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                    {r.name}
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                    {r.email}
                  </td>
                  <td className="py-3 px-4 font-mono font-medium">{r.rollNumber}</td>
                  <td className="py-3 px-4 font-mono text-slate-400">{r.studentId}</td>
                  <td className="py-3 px-4">
                    {r.checkIn ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        <span>{r.checkIn}</span>
                      </span>
                    ) : (
                      <span className="text-rose-500 font-medium flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Missing</span>
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {r.checkOut ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        <span>{r.checkOut}</span>
                      </span>
                    ) : (
                      <span className="text-rose-500 font-medium flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Missing</span>
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <Badge status={r.eligibility} />
                  </td>
                  <td className="py-3 px-4 text-slate-400 text-[11px]">
                    {r.eligibilityReason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredRecords.length > 50 && (
          <div className="p-4 text-center text-xs text-slate-400 border-t border-slate-100 dark:border-slate-800">
            Showing first 50 of {filteredRecords.length} records in preview.
          </div>
        )}
      </div>

      {/* Bottom Floating Commit Bar */}
      <div className="sticky bottom-6 p-4 rounded-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-purple-400/40 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h4 className="font-bold text-sm text-slate-900 dark:text-white">
            Ready to confirm import of {job.validRecords} eligible records?
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            This will create pending certificate requests for all verified attendees.
          </p>
        </div>
        <button
          onClick={handleConfirmImport}
          disabled={isCommitting}
          className="w-full sm:w-auto px-8 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-lg shadow-purple-600/30 transition-all flex items-center justify-center gap-2"
        >
          {isCommitting ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <span>Import {job.validRecords} Valid Records →</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
