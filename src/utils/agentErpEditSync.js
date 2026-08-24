export async function saveAgentThenReconcile({
  agentId,
  data,
  shouldReconcile,
  updateAgent,
  afterLocalSave,
  reconcileAgent,
}) {
  const updatedAgent = await updateAgent({ id: agentId, data });
  await afterLocalSave(updatedAgent);

  if (!shouldReconcile) {
    return {
      localSaved: true,
      reconciliationAttempted: false,
      erpSucceeded: null,
    };
  }

  const erpSucceeded = await reconcileAgent(agentId);
  return {
    localSaved: true,
    reconciliationAttempted: true,
    erpSucceeded,
  };
}