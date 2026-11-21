import React from 'react';
import { CategoryPickerField } from './CategoryPickerField';

type CategoryFilterProps = {
  categories: string[];
  selectedCategory: string | string[];
  onSelectCategory?: (category: string) => void;
  onChangeCategories?: (categories: string[]) => void;
};

export function CategoryFilter({ categories, selectedCategory, onSelectCategory, onChangeCategories }: CategoryFilterProps) {
  const multiple = Array.isArray(selectedCategory);
  const selected = multiple ? selectedCategory : selectedCategory === 'All' ? [] : [selectedCategory];
  return <CategoryPickerField label="Categories" categories={categories} selectedCategories={selected} allowAll multiple={multiple}
    onChange={next => {
      if (onChangeCategories) { onChangeCategories(next); return; }
      if (!multiple) { onSelectCategory?.(next[0] || 'All'); return; }
      // Keep compatibility with older toggle-based callers; new callers commit
      // the entire array once instead of changing filters during selection.
      if (!next.length) { onSelectCategory?.('All'); return; }
      [...selected.filter(category => !next.includes(category)), ...next.filter(category => !selected.includes(category))].forEach(category => onSelectCategory?.(category));
    }} />;
}
