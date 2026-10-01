import { Router } from 'express';

const send = (error, res) => res.status(error.status || 500).json({ error: { code: error.code || 'MISSION_ERROR', message: error.status ? error.message : 'Mission request failed.' } });
export function missionRouter({ projects, missions }) {
  const router = Router();
  router.get('/projects', (req, res) => res.json({ projects: projects.list(req.query.q) }));
  router.post('/projects', async (req, res) => { try { res.status(201).json(await projects.create(req.body)); } catch (error) { send(error, res); } });
  router.get('/projects/:id', (req, res) => { try { res.json({ ...projects.public(req.params.id), missions: missions.list(req.params.id), activity: projects.events(req.params.id) }); } catch (error) { send(error, res); } });
  router.put('/projects/:id', async (req, res) => { try { res.json(await projects.update(req.params.id, req.body)); } catch (error) { send(error, res); } });
  router.delete('/projects/:id', async (req, res) => { try { res.json(await projects.delete(req.params.id, req.body?.confirm === true)); } catch (error) { send(error, res); } });
  router.get('/projects/:id/activity', (req, res) => { try { res.json({ activity: projects.events(req.params.id) }); } catch (error) { send(error, res); } });
  router.get('/projects/:id/missions', (req, res) => { try { res.json({ missions: missions.list(req.params.id, req.query.q) }); } catch (error) { send(error, res); } });
  router.post('/projects/:id/missions', async (req, res) => { try { res.status(201).json(await missions.create(req.params.id, req.body)); } catch (error) { send(error, res); } });
  router.get('/projects/:projectId/missions/:id', (req, res) => { try { res.json(missions.publicMission(missions.getForProject(req.params.projectId, req.params.id))); } catch (error) { send(error, res); } });
  router.get('/missions/:id', (req, res) => { try { res.json(missions.publicMission(missions.getForProject(req.query.projectId, req.params.id))); } catch (error) { send(error, res); } });
  router.get('/missions/:id/runs', (req, res) => { try { res.json({ runs: missions.runs(req.params.id, req.query.projectId) }); } catch (error) { send(error, res); } });
  router.post('/missions/:id/run', async (req, res) => { try { res.status(201).json(await missions.run(req.params.id, req.body || {})); } catch (error) { send(error, res); } });
  router.post('/missions/:id/cancel', async (req, res) => { try { res.json(await missions.cancel(req.params.id, req.body?.projectId)); } catch (error) { send(error, res); } });
  router.get('/mission-runs/:id', (req, res) => { try { res.json(missions.detailRun(req.params.id, req.query.projectId)); } catch (error) { send(error, res); } });
  router.get('/mission-runs/:id/artifacts', (req, res) => { try { res.json({ artifacts: missions.artifacts(req.params.id, req.query.projectId) }); } catch (error) { send(error, res); } });
  router.get('/mission-runs/:id/approvals', (req, res) => { try { res.json({ approvals: missions.approvals(req.params.id, req.query.projectId) }); } catch (error) { send(error, res); } });
  router.post('/mission-runs/:runId/approvals/:approvalId/approve', async (req, res) => { try { res.json(await missions.resolveApproval(req.params.runId, req.params.approvalId, 'APPROVED', req.body?.projectId)); } catch (error) { send(error, res); } });
  router.post('/mission-runs/:runId/approvals/:approvalId/reject', async (req, res) => { try { res.json(await missions.resolveApproval(req.params.runId, req.params.approvalId, 'DENIED', req.body?.projectId)); } catch (error) { send(error, res); } });
  return router;
}
