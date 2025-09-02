interface IStack<T> {
    push(item: T): void;
    pop(): T | undefined;
    peek(): T | undefined;
    isEmpty(): boolean;
    size(): number;
}

class Stack<T> implements IStack<T> {
    private storage: T[] = [];
    private capacity: number;

    constructor(capacity: number = Infinity) {
        this.capacity = capacity;
    }

    push(item: T): void {
        if (this.size() === this.capacity) {
            throw new Error("Stack overflow: cannot push item onto a full stack");
        }
        this.storage.push(item);
    }

    pop(): T | undefined {
        return this.storage.pop();
    }

    peek(): T | undefined {
        return this.storage[this.size() - 1];
    }

    size(): number {
        return this.storage.length;
    }

    isEmpty(): boolean {
        return this.size() === 0;
    }

    clear(): void {
        this.storage = [];
    }
}

export default Stack;