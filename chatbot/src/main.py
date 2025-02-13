import os
import openai
from azure.core.credentials import AzureKeyCredential
from azure.search.documents import SearchClient
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

# Azure OpenAI 및 Azure AI Search 관련 환경 변수 로드
openai.api_type = "azure"
openai.api_base = os.getenv("AZURE_OPENAI_ENDPOINT")
openai.api_key = os.getenv("AZURE_OPENAI_API_KEY")
openai.api_version = os.getenv("AZURE_OPENAI_API_VERSION", "2023-03-15-preview")

azure_openai_deployment_name = os.getenv('AZURE_OPENAI_DEPLOYMENT_NAME')

ai_search_api_key = os.getenv('AI_SEARCH_API_KEY')
ai_search_endpoint = os.getenv('AI_SEARCH_ENDPOINT')
ai_search_index = os.getenv('AI_SEARCH_INDEX')

# Azure Search 클라이언트 설정
search_client = SearchClient(
    endpoint=ai_search_endpoint,
    index_name=ai_search_index,
    credential=AzureKeyCredential(ai_search_api_key)
)

# Azure AI Search에서 검색하기
def search_in_ai_search(query):
    try:
        results = search_client.search(query)
        result_texts = [result['content'] for result in results]
        if result_texts:
            return " ".join(result_texts)  # 검색된 텍스트만 반환
        else:
            return "No relevant information found."
    except Exception as e:
        return f"Error occurred during search: {str(e)}"

def create_prompt_from_search_result(question, context):
    """
    질문과 검색된 내용을 바탕으로 프롬프트를 작성합니다.
    이 프롬프트는 OpenAI 모델에게 답변을 어떻게 생성해야 하는지 알려줍니다.
    """
    prompt = f"""
    ## 역할

    당신은 데이터 전문가이며, 정책 분석가입니다.
 
    ## 지침

    1. 반드시 RAG 데이터를 기반으로 응답해주세요.

    2. RAG 데이터가 아닌 데이터에 대한 정보는 알려주지 마세요.
 

    사용자가 질문한 내용은 다음과 같다:
    질문: "{question}"

    AI Search에서 얻은 정보는 다음과 같다:
    {context}

    너는 위의 정보만을 사용하여, 추가적인 배경 지식 없이 설명해주기 바란다. 
    가능한 한 상세하고 친절하게 답변을 작성해줘.
    """
    return prompt

def chatbot_response(question):
    # AI Search 결과만 사용하여 답변 생성
    context = search_in_ai_search(question)
    
    # 검색된 결과를 바탕으로 프롬프트 작성
    if context != "No relevant information found.":
        prompt = create_prompt_from_search_result(question, context)
        
        # OpenAI API 호출
        try:
            response = openai.ChatCompletion.create(
                deployment_id=azure_openai_deployment_name,
                messages=[{"role": "system", "content": prompt}],
                max_tokens=1500
            )
            return response.choices[0].message['content'].strip()  # 모델의 응답 반환
        except Exception as e:
            return f"Error occurred while generating response: {str(e)}"
    else:
        return "저는 이 질문에 대한 정보를 찾을 수 없습니다. 다른 질문을 해 주세요!"



# 챗봇 실행
if __name__ == "__main__":
    print("Welcome to the chatbot! Type 'exit' to quit.")
    while True:
        question = input("Ask a question: ")
        if question.lower() == 'exit':
            print("Goodbye!")
            break
        response = chatbot_response(question)
        print("Bot Answer:", response)
