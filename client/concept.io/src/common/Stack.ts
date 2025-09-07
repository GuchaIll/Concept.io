/**
 * Interface for Stack data structure operations
 */
interface IStack<T> {
  /**
   * Add an item to the top of the stack
   * @param item - The item to push onto the stack
   */
  push(item: T): void;

  /**
   * Remove and return the top item from the stack
   * @returns The top item, or undefined if stack is empty
   */
  pop(): T | undefined;

  /**
   * View the top item without removing it
   * @returns The top item, or undefined if stack is empty
   */
  peek(): T | undefined;

  /**
   * Check if the stack contains no items
   * @returns True if the stack is empty, false otherwise
   */
  isEmpty(): boolean;

  /**
   * Get the number of items in the stack
   * @returns The stack size
   */
  size(): number;

  /**
   * Remove all items from the stack
   */
  clear(): void;
}

/**
 * Generic stack implementation with a configurable capacity
 */
class Stack<T> implements IStack<T> {
  private storage: T[] = [];
  private readonly capacity: number;

  /**
   * Create a new stack
   * @param capacity - Maximum number of items the stack can hold (default: Infinity)
   */
  constructor(capacity: number = Infinity) {
    this.capacity = Math.max(0, capacity);
  }

  /**
   * Add an item to the top of the stack
   * @param item - The item to push onto the stack
   * @throws Error if the stack is at capacity
   */
  push(item: T): void {
    if (this.size() === this.capacity) {
      // If stack is at capacity and capacity is finite, remove oldest item (rotate)
      if (this.capacity < Infinity && this.capacity > 0) {
        this.storage.shift();
      } else {
        throw new Error("Stack overflow: cannot push item onto a full stack");
      }
    }
    this.storage.push(item);
  }

  /**
   * Remove and return the top item from the stack
   * @returns The top item, or undefined if stack is empty
   */
  pop(): T | undefined {
    return this.storage.pop();
  }

  /**
   * View the top item without removing it
   * @returns The top item, or undefined if stack is empty
   */
  peek(): T | undefined {
    return this.isEmpty() ? undefined : this.storage[this.size() - 1];
  }

  /**
   * Get the number of items in the stack
   * @returns The stack size
   */
  size(): number {
    return this.storage.length;
  }

  /**
   * Check if the stack contains no items
   * @returns True if the stack is empty, false otherwise
   */
  isEmpty(): boolean {
    return this.size() === 0;
  }

  /**
   * Remove all items from the stack
   */
  clear(): void {
    this.storage = [];
  }

  /**
   * Get all items in the stack as an array (for debugging)
   * @returns Array of all items in the stack (bottom to top)
   */
  getItems(): T[] {
    return [...this.storage];
  }
}

export default Stack;