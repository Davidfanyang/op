/**
 * API Client - 统一接口调用层
 */

const API_BASE_URL = 'http://localhost:3001';

class APIClient {
    /**
     * GET 请求
     */
    static async get(path, params = {}) {
        const url = new URL(`${API_BASE_URL}${path}`);
        
        // 添加查询参数（过滤空值）
        Object.keys(params).forEach(key => {
            if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
                url.searchParams.append(key, params[key]);
            }
        });

        try {
            const response = await fetch(url.toString());
            const data = await response.json();
            
            if (data.code !== 0) {
                throw new Error(data.error || data.message || '请求失败');
            }
            
            return data.data;
        } catch (error) {
            console.error('[API] GET error:', error);
            throw error;
        }
    }

    /**
     * POST 请求
     */
    static async post(path, body = {}) {
        try {
            const response = await fetch(`${API_BASE_URL}${path}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            
            const data = await response.json();
            
            if (data.code !== 0) {
                throw new Error(data.error || data.message || '请求失败');
            }
            
            return data.data;
        } catch (error) {
            console.error('[API] POST error:', error);
            throw error;
        }
    }

    /**
     * 审核相关接口
     */
    static async getReviewTasks(params = {}) {
        return await this.get('/review/tasks', params);
    }

    static async getReviewTaskDetail(suggestionId) {
        return await this.get(`/review/tasks/${suggestionId}`);
    }

    static async submitReview(data) {
        return await this.post('/review/submit', data);
    }

    static async getReviewRecords(params = {}) {
        return await this.get('/review/records', params);
    }

    static async getReviewStats() {
        return await this.get('/review/stats');
    }

    /**
     * 质检相关接口
     */
    static async getQualitySessions(params = {}) {
        return await this.get('/quality/sessions', params);
    }

    static async getQualitySessionDetail(sessionId) {
        return await this.get(`/quality/sessions/${sessionId}`);
    }

    static async getQualityEvaluationDetail(evaluationId) {
        return await this.get(`/quality/evaluations/${evaluationId}`);
    }

    static async getQualityAlerts(params = {}) {
        return await this.get('/quality/alerts', params);
    }

    /**
     * 知识库相关接口
     */
    static async getKnowledgeList(params = {}) {
        return await this.get('/knowledge/list', params);
    }

    static async getKnowledgeDetail(knowledgeId) {
        return await this.get(`/knowledge/${knowledgeId}`);
    }

    static async createKnowledge(data) {
        return await this.post('/knowledge/create', data);
    }

    static async updateKnowledge(data) {
        return await this.post('/knowledge/update', data);
    }

    static async updateKnowledgeStatus(data) {
        return await this.post('/knowledge/status', data);
    }

    static async getKnowledgeVersions(knowledgeId) {
        return await this.get(`/knowledge/${knowledgeId}/versions`);
    }

    /**
     * 统计相关接口
     */
    static async getStatsOverview() {
        return await this.get('/stats/overview');
    }

    static async getStatsTraining() {
        return await this.get('/stats/training');
    }

    static async getStatsQuality() {
        return await this.get('/stats/quality');
    }

    static async getStatsAlerts() {
        return await this.get('/stats/alerts');
    }

    static async getStatsReviews() {
        return await this.get('/stats/reviews');
    }

    static async getStatsKnowledge() {
        return await this.get('/stats/knowledge');
    }

    static async getStatsTrend() {
        return await this.get('/stats/trend');
    }

    static async getStatsAgents() {
        return await this.get('/stats/agents');
    }
}
