/**
 * 消息菜单栏按钮可见性配置
 */
export interface ButtonVisibility {
  copy?: boolean;
  edit?: boolean;
  createBranch?: boolean;
  delete?: boolean;
  regenerate?: boolean;
  toggleEnabled?: boolean;
  abort?: boolean;
  analyzeContext?: boolean;
  exportBranch?: boolean;
  moreMenu?: boolean;
}