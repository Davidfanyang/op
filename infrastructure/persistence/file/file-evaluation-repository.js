/**
 * File-based Evaluation Repository 实现
 * 
 * 基于文件系统的评估结果持久化
 */

const fs = require('fs').promises;
const path = require('path');
const { EvaluationRepository } = require('../../../repositories/evaluation-repository');

class FileEvaluationRepository extends EvaluationRepository {
  constructor(basePath = './runtime/persistence/evaluations') {
    super();
    this.basePath = path.resolve(basePath);
    this.evaluationsFile = path.join(this.basePath, 'evaluations.json');
    this.indexFile = path.join(this.basePath, 'evaluation-index.json');
    this._initialized = false;
  }

  async _ensureInitialized() {
    if (this._initialized) return;
    
    try {
      await fs.mkdir(this.basePath, { recursive: true });
      try {
        await fs.access(this.evaluationsFile);
      } catch {
        await fs.writeFile(this.evaluationsFile, JSON.stringify([], null, 2));
      }
      try {
        await fs.access(this.indexFile);
      } catch {
        await fs.writeFile(this.indexFile, JSON.stringify({
          byMessage: {},
          bySession: {},
          byProject: {},
          alerts: {}
        }, null, 2));
      }
    } catch (err) {
      console.error('Failed to initialize evaluation storage:', err);
      throw err;
    }
    this._initialized = true;
  }

  async _readEvaluations() {
    try {
      const data = await fs.readFile(this.evaluationsFile, 'utf8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  async _writeEvaluations(evaluations) {
    await fs.writeFile(this.evaluationsFile, JSON.stringify(evaluations, null, 2));
  }

  async _readIndex() {
    try {
      const data = await fs.readFile(this.indexFile, 'utf8');
      return JSON.parse(data);
    } catch {
      return { byMessage: {}, bySession: {}, byProject: {}, alerts: {} };
    }
  }

  async _writeIndex(index) {
    await fs.writeFile(this.indexFile, JSON.stringify(index, null, 2));
  }

  _generateId() {
    return `eval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async save(evaluationData) {
    await this._ensureInitialized();
    const evaluationId = evaluationData.evaluationId || this._generateId();
    const now = new Date().toISOString();
    
    const evaluation = {
      evaluationId,
      messageId: evaluationData.messageId,
      sessionId: evaluationData.sessionId,
      projectId: evaluationData.projectId,
      mode: evaluationData.mode,
      scenarioId: evaluationData.scenarioId,
      status: evaluationData.status,
      alertLevel: evaluationData.alertLevel || 'none',
      score: evaluationData.score ?? 0,
      dimensionScores: evaluationData.dimensionScores || {},
      findings: evaluationData.findings || [],
      suggestions: evaluationData.suggestions || [],
      alerts: evaluationData.alerts || [],
      summary: evaluationData.summary || '',
      standardReply: evaluationData.standardReply || null,
      matchedScenario: evaluationData.matchedScenario || null,
      matchConfidence: evaluationData.matchConfidence || null,
      createdAt: now,
      rawResult: evaluationData.rawResult || {}
    };

    const evaluations = await this._readEvaluations();
    evaluations.push(evaluation);
    await this._writeEvaluations(evaluations);

    // 更新索引
    const index = await this._readIndex();
    
    if (evaluation.messageId) {
      index.byMessage[evaluation.messageId] = evaluationId;
    }
    
    if (evaluation.sessionId) {
      if (!index.bySession[evaluation.sessionId]) {
        index.bySession[evaluation.sessionId] = [];
      }
      index.bySession[evaluation.sessionId].push(evaluationId);
    }
    
    if (!index.byProject[evaluation.projectId]) {
      index.byProject[evaluation.projectId] = [];
    }
    index.byProject[evaluation.projectId].push(evaluationId);
    
    // 告警索引
    if (evaluation.alertLevel && evaluation.alertLevel !== 'none') {
      if (!index.alerts[evaluation.projectId]) {
        index.alerts[evaluation.projectId] = [];
      }
      index.alerts[evaluation.projectId].push({
        evaluationId,
        alertLevel: evaluation.alertLevel,
        createdAt: now
      });
    }
    
    await this._writeIndex(index);

    return evaluation;
  }

  async findById(evaluationId) {
    await this._ensureInitialized();
    const evaluations = await this._readEvaluations();
    return evaluations.find(e => e.evaluationId === evaluationId) || null;
  }

  async findByMessageId(messageId) {
    await this._ensureInitialized();
    const index = await this._readIndex();
    const evaluationId = index.byMessage[messageId];
    if (!evaluationId) return null;
    return this.findById(evaluationId);
  }

  async findBySessionId(sessionId) {
    await this._ensureInitialized();
    const index = await this._readIndex();
    const evaluationIds = index.bySession[sessionId] || [];
    const evaluations = await this._readEvaluations();
    return evaluations.filter(e => evaluationIds.includes(e.evaluationId))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async findRecent(projectId, mode = null, options = { limit: 20 }) {
    await this._ensureInitialized();
    let evaluations = await this._readEvaluations();
    
    evaluations = evaluations.filter(e => e.projectId === projectId);
    
    if (mode) {
      evaluations = evaluations.filter(e => e.mode === mode);
    }
    
    if (options.alertLevel) {
      evaluations = evaluations.filter(e => e.alertLevel === options.alertLevel);
    }
    
    evaluations.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    return evaluations.slice(0, options.limit);
  }

  async updateStatus(evaluationId, status, updates = {}) {
    await this._ensureInitialized();
    const evaluations = await this._readEvaluations();
    const index = evaluations.findIndex(e => e.evaluationId === evaluationId);
    
    if (index === -1) {
      throw new Error(`Evaluation not found: ${evaluationId}`);
    }

    evaluations[index] = {
      ...evaluations[index],
      status,
      ...updates
    };

    await this._writeEvaluations(evaluations);
    return evaluations[index];
  }

  async findAlerts(projectId, alertLevel = null, pagination = { page: 1, limit: 20 }) {
    await this._ensureInitialized();
    let evaluations = await this._readEvaluations();
    
    evaluations = evaluations.filter(e => 
      e.projectId === projectId && 
      e.alertLevel && 
      e.alertLevel !== 'none'
    );
    
    if (alertLevel) {
      evaluations = evaluations.filter(e => e.alertLevel === alertLevel);
    }
    
    evaluations.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    const total = evaluations.length;
    const start = (pagination.page - 1) * pagination.limit;
    const items = evaluations.slice(start, start + pagination.limit);
    
    return { items, total };
  }
}

module.exports = { FileEvaluationRepository };
