import { get, filter, isArray, isObject } from 'lodash-es';

export interface FilterCondition {
  key: string;
  operator: 'eq' | 'ne' | 'contains' | 'truthy' | 'falsy' | 'custom';
  value?: any;
  customScript?: string;
}

export interface FilterOptions {
  dataPath?: string; // 如果 JSON 是个大对象，数组在某个属性里，比如 "data.items"
  conditions: FilterCondition[];
  keepUnmatched?: boolean; // 是否保留不匹配的（通常是剔除，所以默认 false）
}

export interface FilterResult {
  data: any;
  total: number;
  filtered: number;
  error?: string;
}

/**
 * 执行过滤逻辑
 */
export function applyFilter(input: any, options: FilterOptions): FilterResult {
  try {
    let target = input;

    // 1. 定位目标数组
    if (options.dataPath) {
      target = get(input, options.dataPath);
    }

    if (!isArray(target)) {
      if (isObject(target)) {
        // 如果不是数组但是对象，尝试自动找数组字段（可选增强）
        return { data: target, total: 0, filtered: 0, error: '目标路径不是一个数组' };
      }
      return { data: target, total: 0, filtered: 0, error: '输入数据不是数组' };
    }

    const total = target.length;

    // 2. 执行过滤
    const filteredData = filter(target, (item) => {
      return options.conditions.every(cond => {
        const itemValue = get(item, cond.key);

        switch (cond.operator) {
          case 'eq':
            return itemValue === cond.value;
          case 'ne':
            return itemValue !== cond.value;
          case 'contains':
            return String(itemValue).includes(String(cond.value));
          case 'truthy':
            return !!itemValue;
          case 'falsy':
            return !itemValue;
          case 'custom':
            if (!cond.customScript) return true;
            try {
              // 安全起见，这里可以使用简单的 Function 构造，或者更复杂的沙箱
              const fn = new Function('item', 'value', `return ${cond.customScript}`);
              return fn(item, cond.value);
            } catch (e) {
              console.error('Custom script error:', e);
              return true;
            }
          default:
            return true;
        }
      });
    });

    return {
      data: filteredData,
      total,
      filtered: filteredData.length
    };
  } catch (err: any) {
    return {
      data: input,
      total: 0,
      filtered: 0,
      error: err.message || '过滤执行失败'
    };
  }
}