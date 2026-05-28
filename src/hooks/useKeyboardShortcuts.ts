import { useEffect } from 'react';
import { useShowStore } from '../store/showStore';

export function useKeyboardShortcuts(onShowShortcuts?: () => void) {
  const {
    undo, redo, selectedItem, selectedItemIds,
    deletePerformer, deleteProp, setSelectedItem,
    selectAllItems, copySelectedPerformers, pastePerformers,
    setSelectedItemIds,
  } = useShowStore();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      const tag = (e.target as HTMLElement).tagName;

      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        const state = useShowStore.getState();
        if (state.selectedItemIds.length > 0 && state.show) {
          e.preventDefault();
          const cfg = state.show.stage_config;
          const stepX = cfg.width / cfg.divisionsX / cfg.subdivisionsX;
          const stepY = cfg.height / cfg.divisionsY / cfg.subdivisionsY;
          if (e.key === 'ArrowLeft')  state.nudgeSelected(-stepX, 0);
          if (e.key === 'ArrowRight') state.nudgeSelected(stepX, 0);
          if (e.key === 'ArrowUp')    state.nudgeSelected(0, -stepY);
          if (e.key === 'ArrowDown')  state.nudgeSelected(0, stepY);
          return;
        }
      }

      if (meta && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      if (meta && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }

      if (meta && e.key === 'a') {
        e.preventDefault();
        selectAllItems();
        return;
      }

      if (meta && e.key === 'c' && selectedItemIds.length > 0) {
        e.preventDefault();
        copySelectedPerformers();
        return;
      }

      if (meta && e.key === 'v') {
        e.preventDefault();
        pastePerformers();
        return;
      }

      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedItem) {
        e.preventDefault();
        if (selectedItem.type === 'performer') {
          deletePerformer(selectedItem.id);
        } else if (selectedItem.type === 'prop') {
          deleteProp(selectedItem.id);
        }
        setSelectedItem(null);
      }

      if (e.key === 'Escape') {
        setSelectedItem(null);
        setSelectedItemIds([]);
      }

      if (e.key === '?' && !meta) {
        e.preventDefault();
        onShowShortcuts?.();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, selectedItem, selectedItemIds, deletePerformer, deleteProp, setSelectedItem, selectAllItems, copySelectedPerformers, pastePerformers, setSelectedItemIds, onShowShortcuts]);
}
