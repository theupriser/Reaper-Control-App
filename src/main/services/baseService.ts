/**
 * Base Service
 * Provides common functionality for service classes
 */
import { EventEmitter } from 'events';
import { ReaperConnector } from './reaperConnector';
import logger from '../utils/logger';

/**
 * Base class for services to implement common functionality
 */
export abstract class BaseService<T> extends EventEmitter {
  protected items: T[] = [];
  protected reaperConnector: ReaperConnector;
  protected eventName: string;

  /**
   * Constructor
   * @param reaperConnector - REAPER connector instance
   * @param eventName - Name of the event to emit when items change
   */
  constructor(reaperConnector: ReaperConnector, eventName: string) {
    super();
    this.reaperConnector = reaperConnector;
    this.eventName = eventName;

    // Set up common event listeners
    this.setupEventListeners();

    logger.info(`${this.constructor.name} initialized`);
  }

  /**
   * Set up event listeners
   * Override in derived classes to add additional listeners
   */
  protected setupEventListeners(): void {
    // Listen for project changes
    this.reaperConnector.on('projectChanged', () => {
      this.refreshItems();
    });
  }

  /**
   * Handle items update
   * @param items - Updated items
   */
  protected handleItemsUpdate(items: T[]): void {
    logger.debug(`${this.eventName} updated`, { count: items.length });
    this.items = items;
    this.emit(this.eventName, this.getItems());
  }

  /**
   * Get all items
   * @returns All items
   */
  public getItems(): T[] {
    return this.items;
  }

  /**
   * Get item by ID
   * Override in derived classes to implement specific ID lookup logic
   * @param id - Item ID
   * @returns Item or undefined if not found
   */
  public abstract getItemById(id: string | number): T | undefined;

  /**
   * Refresh items from REAPER
   * Override in derived classes to implement specific refresh logic
   * @returns Promise that resolves with the items
   */
  public abstract refreshItems(): Promise<T[]>;

  /**
   * Get next item
   * Override in derived classes to implement specific next item logic
   * @param currentId - Current item ID
   * @returns Next item or undefined if not found
   */
  public abstract getNextItem(currentId: string | number): T | undefined;

  /**
   * Get previous item
   * Override in derived classes to implement specific previous item logic
   * @param currentId - Current item ID
   * @returns Previous item or undefined if not found
   */
  public abstract getPreviousItem(currentId: string | number): T | undefined;

  /**
   * Standard error handling for service methods
   * @param operation - Operation function to execute
   * @param operationName - Name of the operation for logging
   * @param context - Additional context for logging
   * @returns Promise that resolves with the result of the operation
   */
  protected async withErrorHandling<R>(
    operation: () => Promise<R>,
    operationName: string,
    context: Record<string, any> = {}
  ): Promise<R> {
    try {
      return await operation();
    } catch (error) {
      logger.error(`Failed to ${operationName}`, { error, ...context });
      throw error;
    }
  }
}
