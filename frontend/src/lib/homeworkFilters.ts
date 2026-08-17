import { QuestionSummary, QuestionWithCreator } from './api';

export type SortColumn = 'text' | 'class_label' | 'submission_count' | 'reviewed' | 'created_at' | 'time_limit_secs' | 'question_type';
export type SortDirection = 'asc' | 'desc';

export type FilterKey = 'class_label' | 'reviewed_status' | 'question_type';
export type Filters = Partial<Record<FilterKey, string>>;

// Query-param names used to make the filtered/sorted table shareable via URL
export const FILTER_PARAMS: Record<FilterKey, string> = {
  class_label: 'class',
  reviewed_status: 'status',
  question_type: 'type',
};

export const SORT_COLUMNS: SortColumn[] = [
  'text',
  'class_label',
  'submission_count',
  'reviewed',
  'created_at',
  'time_limit_secs',
  'question_type',
];

export const DEFAULT_SORT_COLUMN: SortColumn = 'created_at';
export const DEFAULT_SORT_DIRECTION: SortDirection = 'desc';

export function getReviewedStatus(q: QuestionSummary | QuestionWithCreator): string {
  if (q.submission_count === 0) return 'No submissions';
  if (q.feedback_count >= q.submission_count) return 'All reviewed';
  return 'Pending';
}

export function getReviewedRatio(q: QuestionSummary | QuestionWithCreator): number {
  if (q.submission_count === 0) return -1;
  return q.feedback_count / q.submission_count;
}

export function filterQuestions<T extends QuestionSummary | QuestionWithCreator>(questions: T[], filters: Filters): T[] {
  return questions.filter((q) => {
    if (filters.class_label && q.class_label !== filters.class_label) return false;
    if (filters.reviewed_status && getReviewedStatus(q) !== filters.reviewed_status) return false;
    if (filters.question_type) {
      const qType = q.question_type || 'speaking';
      const filterType = filters.question_type.toLowerCase();
      if (qType !== filterType) return false;
    }
    return true;
  });
}

export function sortQuestions<T extends QuestionSummary | QuestionWithCreator>(questions: T[], sortColumn: SortColumn, sortDirection: SortDirection): T[] {
  const sorted = [...questions];
  sorted.sort((a, b) => {
    let cmp = 0;
    switch (sortColumn) {
      case 'text':
        cmp = a.text.localeCompare(b.text);
        break;
      case 'class_label':
        cmp = (a.class_label || '').localeCompare(b.class_label || '');
        break;
      case 'submission_count':
        cmp = a.submission_count - b.submission_count;
        break;
      case 'reviewed':
        cmp = getReviewedRatio(a) - getReviewedRatio(b);
        break;
      case 'created_at':
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        break;
      case 'time_limit_secs':
        cmp = a.time_limit_secs - b.time_limit_secs;
        break;
      case 'question_type':
        cmp = (a.question_type || 'speaking').localeCompare(b.question_type || 'speaking');
        break;
    }
    return sortDirection === 'asc' ? cmp : -cmp;
  });
  return sorted;
}
