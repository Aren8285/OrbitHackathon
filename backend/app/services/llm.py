from typing import Any, Dict


class PromptBuilder:
    def build(self, context: Dict[str, Any]) -> str:
        return '
'.join(
            [
                'You are the risk prioritization assistant for RiskOps.',
                f"Context summary: {context.get('summary', '')}",
                'Produce a brief executive recommendation focused on highest-risk assets and remediation priority.',
            ]
        )


def call_llm(prompt: str, api_key: str = '') -> str:
    if not api_key:
        return 'LLM key not configured. Returning local summary.'
    return f'LLM response for: {prompt[:120]}'
