export default function NPSSurvey() {
  return (
    <div className="fixed inset-0 w-screen h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          ✅ PÁGINA NPS FUNCIONANDO!
        </h1>
        <p className="text-xl text-gray-600">
          Se você vê esta mensagem, a página está carregando corretamente.
        </p>
        <p className="text-sm text-gray-500 mt-4">
          Token: {new URLSearchParams(window.location.search).get('token')}
        </p>
      </div>
    </div>
  );
}