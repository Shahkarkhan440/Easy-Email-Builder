import { TEditorConfiguration } from './core';

/**
 * History manager
 * Manages the document's undo/redo history
 */
export class HistoryManager {
  private past: TEditorConfiguration[] = [];
  private present: TEditorConfiguration;
  private future: TEditorConfiguration[] = [];
  private readonly maxHistorySize: number = 5; // Up to 5 undo steps

  constructor(initialDocument: TEditorConfiguration) {
    this.present = this.deepClone(initialDocument);
  }

  /**
   * Record a new history state
   */
  record(newDocument: TEditorConfiguration): TEditorConfiguration {
    // Skip if the new document equals the current one
    if (this.isEqual(this.present, newDocument)) {
      return this.present;
    }

    // Push the current state onto the history stack
    this.past.push(this.present);

    // Limit history size
    if (this.past.length > this.maxHistorySize) {
      this.past.shift(); // Drop the oldest entry
    }

    // Update the current state
    this.present = this.deepClone(newDocument);

    // Clear the redo stack (a new action invalidates redo)
    this.future = [];

    return this.present;
  }

  /**
   * Undo
   */
  undo(): TEditorConfiguration | null {
    if (this.past.length === 0) {
      return null; // Nothing to undo
    }

    // Push the current state onto the redo stack
    this.future.unshift(this.present);

    // Pop the previous state from history
    const previous = this.past.pop()!;
    this.present = this.deepClone(previous);

    return this.present;
  }

  /**
   * Redo
   */
  redo(): TEditorConfiguration | null {
    if (this.future.length === 0) {
      return null; // Nothing to redo
    }

    // Push the current state onto the history stack
    this.past.push(this.present);

    // Limit history size
    if (this.past.length > this.maxHistorySize) {
      this.past.shift();
    }

    // Pop the next state from the redo stack
    const next = this.future.shift()!;
    this.present = this.deepClone(next);

    return this.present;
  }

  /**
   * Whether undo is available
   */
  canUndo(): boolean {
    return this.past.length > 0;
  }

  /**
   * Whether redo is available
   */
  canRedo(): boolean {
    return this.future.length > 0;
  }

  /**
   * Get the current state
   */
  getPresent(): TEditorConfiguration {
    return this.present;
  }

  /**
   * Reset history (when the document is reset externally)
   */
  reset(newDocument: TEditorConfiguration): void {
    this.past = [];
    this.present = this.deepClone(newDocument);
    this.future = [];
  }

  /**
   * Deep-clone the document via JSON (simple and fast)
   */
  private deepClone(document: TEditorConfiguration): TEditorConfiguration {
    return JSON.parse(JSON.stringify(document)) as TEditorConfiguration;
  }

  /**
   * Shallow equality check to avoid duplicate entries
   */
  private isEqual(doc1: TEditorConfiguration, doc2: TEditorConfiguration): boolean {
    return JSON.stringify(doc1) === JSON.stringify(doc2);
  }
}
