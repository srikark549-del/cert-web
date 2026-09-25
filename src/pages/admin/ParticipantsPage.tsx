import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Users,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Download,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Participant, EligibilityStatus, CertificateStatus } from '../../types';
import { participantsService, ParticipantFilterOptions } from '../../api/participants';
import { store } from '../../api/store';
import { Badge } from '../../components/common/Badge';
import { useNotifications } from '../../context/NotificationContext';

export const ParticipantsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useNotifications();

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [eligibilityFilter, setEligibilityFilter] = useState<EligibilityStatus | 'ALL'>(
    searchParams.get('filter') === 'eligible'
      ? 'ELIGIBLE'
      : searchParams.get('filter') === 'ineligible'
      ? 'NOT_ELIGIBLE'
      : 'ALL'
  );
  const [statusFilter, setStatusFilter] = useState<CertificateStatus | 'ALL'>('ALL');
  const [departmentFilter, setDepartmentFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'name' | 'rollNumber' | 'checkIn' | 'checkOut'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const fetchParticipants = async () => {
    setIsLoading(true);
    const options: ParticipantFilterOptions = {
      search,
      eligibility: eligibilityFilter,
      certificateStatus: statusFilter,
      department: departmentFilter,
      page,
      pageSize,
      sortBy,
      sortOrder,
    };
    const res = await participantsService.getParticipants(options);
    if (res.success && res.data) {
      setParticipants(res.data.items);
      setTotalCount(res.data.total);
      setTotalPages(res.data.totalPages);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchParticipants();
    return store.subscribe(fetchParticipants);
  }, [search, eligibilityFilter, statusFilter, departmentFilter, page, sortBy, sortOrder]);

  const toggleSort = (field: 'name' | 'rollNumber' | 'checkIn' | 'checkOut') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const handleExportCSV = () => {
    const all = store.getParticipants();
    const headers = ['ID', 'Name', 'Email', 'Student ID', 'Roll Number', 'Check-in', 'Check-out', 'Eligibility', 'Status'];
    const rows = all.map((p) => [
      p.id,
      `"${p.name}"`,
      p.email,
      p.studentId,
      p.rollNumber,
      p.checkIn || 'None',
      p.checkOut || 'None',
      p.eligibility,
      p.certificateStatus,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'pycore_participants_attendance.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('success', 'Export Complete', 'Participant attendance registry exported as CSV.');
  };

  const departments = [
    'ALL',
    'Computer Science & Engineering',
    'Artificial Intelligence & Data Science',
    'Electronics & Communication',
    'Information Technology',
    'Electrical & Electronics',
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 text-xs font-semibold mb-2">
            <Users className="w-3.5 h-3.5" />
            <span>Attendee Directory</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Participant Roster</h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Search, filter, and inspect verified attendance timestamps and credential statuses.
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold shadow-sm transition-all flex items-center gap-2 self-start sm:self-auto"
        >
          <Download className="w-4 h-4 text-purple-600" />
          <span>Export Attendance CSV</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search name, email, roll no..."
              className="w-full pl-10 pr-4 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 focus:ring-2 focus:ring-purple-500 focus:outline-none"
            />
          </div>

          {/* Eligibility Filter */}
          <div>
            <select
              value={eligibilityFilter}
              onChange={(e) => {
                setEligibilityFilter(e.target.value as EligibilityStatus | 'ALL');
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="ALL">All Eligibility (250)</option>
              <option value="ELIGIBLE">Eligible Only (220)</option>
              <option value="NOT_ELIGIBLE">Not Eligible (30)</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as CertificateStatus | 'ALL');
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="ALL">All Certificate Statuses</option>
              <option value="PENDING">Pending Approval</option>
              <option value="APPROVED">Approved</option>
              <option value="GENERATED">Generated</option>
              <option value="SENT">Sent to Email</option>
              <option value="REJECTED">Rejected</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>

          {/* Department Filter */}
          <div>
            <select
              value={departmentFilter}
              onChange={(e) => {
                setDepartmentFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d === 'ALL' ? 'All Academic Departments' : d}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
          <span>
            Showing {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, totalCount)} of {totalCount} participants
          </span>
          {(search || eligibilityFilter !== 'ALL' || statusFilter !== 'ALL' || departmentFilter !== 'ALL') && (
            <button
              onClick={() => {
                setSearch('');
                setEligibilityFilter('ALL');
                setStatusFilter('ALL');
                setDepartmentFilter('ALL');
                setPage(1);
              }}
              className="text-purple-600 dark:text-purple-400 font-semibold hover:underline"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Participants Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wider font-semibold text-[10px]">
              <tr>
                <th
                  onClick={() => toggleSort('name')}
                  className="py-3.5 px-4 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Participant Name</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3.5 px-4">Email</th>
                <th
                  onClick={() => toggleSort('rollNumber')}
                  className="py-3.5 px-4 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Roll Number</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3.5 px-4">Student ID</th>
                <th
                  onClick={() => toggleSort('checkIn')}
                  className="py-3.5 px-4 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Check-in</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('checkOut')}
                  className="py-3.5 px-4 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Check-out</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3.5 px-4">Eligibility</th>
                <th className="py-3.5 px-4">Certificate Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {participants.map((p) => (
                <tr
                  key={p.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="py-3.5 px-4">
                    <span className="font-bold text-slate-900 dark:text-white">{p.name}</span>
                    <p className="text-[11px] text-slate-400">{p.department}</p>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400">
                    {p.email}
                  </td>
                  <td className="py-3.5 px-4 font-mono font-medium">{p.rollNumber}</td>
                  <td className="py-3.5 px-4 font-mono text-slate-400">{p.studentId}</td>
                  <td className="py-3.5 px-4">
                    {p.checkIn ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        {p.checkIn}
                      </span>
                    ) : (
                      <span className="text-rose-500 font-medium">Missing</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    {p.checkOut ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        {p.checkOut}
                      </span>
                    ) : (
                      <span className="text-rose-500 font-medium">Missing</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    <Badge status={p.eligibility} />
                  </td>
                  <td className="py-3.5 px-4">
                    <Badge status={p.certificateStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Toolbar */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Page <span className="font-bold text-slate-800 dark:text-slate-200">{page}</span> of{' '}
            <span className="font-bold text-slate-800 dark:text-slate-200">{totalPages}</span>
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
