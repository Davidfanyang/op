/**
 * 主管打标API路由（最小闭环）
 *
 * 接口：
 * - GET  /review/tag/:evaluation_id      查询待打标详情
 * - POST /review/tag                     提交打标
 * - GET  /review/tagged-records          查询打标记录
 */

const url = require('url');
const { TaggingService } = require('../services/tagging-service');
const { getDefaultFactory } = require('../repositories');

const taggingService = new TaggingService();
const repoFactory = getDefaultFactory();
const evaluationsRepo = repoFactory.getLiveEvaluationRepository();
const messagesRepo = repoFactory.getLiveMessageRepository();
const reviewsRepo = repoFactory.getReviewsRepository();

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function safeJsonSummary(outputPayload) {
  if (!outputPayload) return null;
  const payload = typeof outputPayload === 'string' ? JSON.parse(outputPayload) : outputPayload;
  return {
    score: payload.score ?? null,
    problem_type: payload.problem_type ?? null,
    scenario: payload.scenario ?? null,
    issues: Array.isArray(payload.issues) ? payload.issues : [],
    missing_info: Array.isArray(payload.missing_info) ? payload.missing_info : [],
    suggested_reply: payload.suggested_reply ?? null,
    risk_level: payload.risk_level ?? null,
    confidence: payload.confidence ?? null
  };
}

async function getTagDetail(evaluationId) {
  const evaluation = await evaluationsRepo.findById(evaluationId);
  if (!evaluation) {
    return { code: 1, error: 'evaluation_not_found', message: 'evaluation 不存在' };
  }

  const conversation = evaluation.sessionId
    ? await messagesRepo.findBySessionId(evaluation.sessionId, { order: 'asc', limit: 200 })
    : [];

  const review = await reviewsRepo.findByEvaluationId(evaluationId);

  return {
    code: 0,
    data: {
      evaluation: {
        evaluation_id: evaluation.evaluationId,
        session_id: evaluation.sessionId,
        message_id: evaluation.messageId,
        project: evaluation.project,
        scenario: evaluation.scenario,
        judgement: evaluation.judgement,
        summary: evaluation.summary,
        confidence: evaluation.confidence,
        problem_type: evaluation.problemType,
        need_review: evaluation.needReview,
        created_at: evaluation.createdAt
      },
      conversation: (conversation || []).map(msg => ({
        role: msg.role,
        sender_name: msg.senderName,
        content: msg.content,
        timestamp: msg.timestamp
      })),
      qwen3_analysis: safeJsonSummary(evaluation.outputPayload),
      review: review ? {
        review_id: review.reviewId,
        review_status: review.reviewStatus,
        reviewer_id: review.reviewerId,
        knowledge_id: review.knowledgeId,
        problem_tags: review.problemTags,
        reviewed_at: review.reviewedAt
      } : null,
      reviewed: !!review
    }
  };
}

async function handleTaggingAPI(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  if (req.method === 'GET') {
    const detailMatch = pathname.match(/^\/review\/tag\/([^/]+)$/);
    if (detailMatch) {
      try {
        const result = await getTagDetail(detailMatch[1]);
        res.writeHead(result.code === 0 ? 200 : 404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 500, error: { message: error.message } }));
      }
      return;
    }
  }

  if (pathname === '/review/tag' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const result = await taggingService.submitTag(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 0, data: result }));
    } catch (error) {
      const isBadRequest = /缺少必填字段|必须是|不存在|已完成打标/.test(error.message);
      res.writeHead(isBadRequest ? 400 : 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        code: isBadRequest ? 400 : 500,
        error: { message: error.message }
      }));
    }
    return;
  }

  if (pathname === '/review/tagged-records' && req.method === 'GET') {
    try {
      const { project_id, reviewer_id, faq_eligible, page, page_size } = parsedUrl.query;
      const filters = {};
      if (project_id) filters.project_id = project_id;
      if (reviewer_id) filters.reviewer_id = reviewer_id;
      if (faq_eligible !== undefined) filters.faq_eligible = faq_eligible === 'true';

      const result = await taggingService.getTaggedRecords(filters, {
        page: page || 1,
        page_size: page_size || 20
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 0, data: result }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 500, error: { message: error.message } }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
}

module.exports = handleTaggingAPI;
