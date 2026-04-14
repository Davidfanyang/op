# 对话分析器 - 数据结构定义 v4.0

## 1. 评估输入 Schema

### 1.1 ConversationTurn (单轮对话)
```javascript
{
  turnIndex: number,           // 轮次索引 (从0开始)
  role: 'customer' | 'agent',  // 角色
  content: string,             // 消息内容
  timestamp: string,           // ISO时间戳
  metadata?: object            // 元数据
}
```

### 1.2 AnalyzeTurnInput (分析单轮输入)
```javascript
{
  projectId: string,           // 项目ID
  mode: 'training' | 'live_monitor',
  scenarioId: string,          // 场景ID
  conversation: ConversationTurn[],  // 完整对话上下文
  currentReply: string,        // 当前客服回复(待分析)
  metadata?: {
    sessionId?: string,
    employeeId?: string,
    messageId?: string
  }
}
```

### 1.3 AnalyzeConversationInput (分析完整对话输入)
```javascript
{
  projectId: string,
  mode: 'training' | 'live_monitor',
  scenarioId: string,
  conversation: ConversationTurn[],  // 完整对话
  metadata?: object
}
```

## 2. 评估输出 Schema

### 2.1 DialogueAnalysisResult (对话分析结果)
```javascript
{
  // ========== 场景与阶段识别 ==========
  scenario: {
    id: string,                // 场景ID
    title: string,             // 场景标题
    matchedStage: string,      // 当前阶段ID
    stageName: string          // 阶段名称
  },
  
  // ========== 当前轮次分析 ==========
  stage: {
    id: string,                // 阶段ID
    name: string,              // 阶段名称
    description: string,       // 阶段描述
    expectedActions: string[], // 期望动作列表
    mustInclude: string[],     // 必须包含的信息
    mustAvoid: string[]        // 必须避免的内容
  },
  
  // ========== 分析结果 ==========
  result: {
    level: 'pass' | 'borderline' | 'fail' | 'risk',  // 轻量等级
    issues: [{                 // 问题列表
      type: 'missing_info' | 'wrong_action' | 'forbidden_content' | 'incomplete' | 'out_of_stage',
      severity: 'high' | 'medium' | 'low',
      message: string,         // 问题描述
      expected: string,        // 期望行为
      actual: string           // 实际行为
    }],
    missing: string[],         // 缺失的关键信息
    nextAction: string         // 建议的下一步行动
  },
  
  // ========== 诊断总结 ==========
  coachSummary: string,        // 教练式诊断总结
  riskLevel: 'none' | 'low' | 'medium' | 'high',  // 风险等级
  
  // ========== 元数据 ==========
  meta: {
    analyzerVersion: 'v4.0',
    mode: string,
    timestamp: string,
    conversationTurns: number  // 对话总轮次
  }
}
```

## 3. 场景规则 Schema (stages[])

### 3.1 Scenario Rule File
```javascript
{
  id: string,                  // 场景ID
  product: string,             // 产品线
  category: string,            // 分类
  title: string,               // 场景标题
  description: string,         // 场景描述
  customerMessage: string,     // 典型客户问题(用于匹配)
  
  stages: [                    // 阶段规则列表(按顺序)
    {
      id: string,              // 阶段ID (如: stage_1_greet)
      name: string,            // 阶段名称
      description: string,     // 阶段描述
      trigger: {               // 触发条件
        turnIndex: number,     // 期望轮次(可选)
        customerIntent: string // 客户意图关键词
      },
      expectedActions: string[],     // 期望动作
      mustInclude: string[],         // 必须包含的信息/话术
      mustAvoid: string[],           // 必须避免的内容
      completionCriteria: string[],  // 完成标准
      nextStage: string              // 下一阶段ID
    }
  ],
  
  // 全局规则
  globalRules: {
    alwaysInclude: string[],   // 始终必须包含的(如礼貌用语)
    alwaysAvoid: string[]      // 始终必须避免的(如推诿)
  }
}
```

## 4. 核心原则

### 4.1 判断逻辑变更
- **旧**: 和标准答案像不像 (cosine similarity)
- **新**: 当前回复在当前阶段下是否合理、完整、推进问题解决

### 4.2 等级体系
- **pass**: 回复符合当前阶段期望,包含关键信息,无禁忌内容
- **borderline**: 回复方向正确,但缺少部分信息或表达不够完整
- **fail**: 回复缺少关键信息或包含不当内容,需要改进
- **risk**: 回复包含严重问题(禁忌内容/错误指引/态度问题)

### 4.3 多轮上下文支持
- 必须基于完整对话历史判断当前回复
- 识别客户意图演化
- 追踪信息收集进度
- 判断阶段转换时机

### 4.4 FAQ 角色转变
- **旧**: 标准答案对比库
- **新**: 场景规则库(stages定义各阶段期望)
