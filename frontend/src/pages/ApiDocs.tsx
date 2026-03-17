
const ApiDocs = () => {
  return (
    <div className="h-full flex flex-col space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-3xl font-black text-slate-900">Documentation API</h2>
          <p className="text-slate-500 mt-2 font-medium">Spécifications OpenAPI / Swagger de la plateforme APM</p>
        </div>
        <a 
          href="http://localhost:8001/api-docs" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-xs font-bold text-blue-600 bg-blue-50 px-4 py-2 rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors"
        >
          OUVRIR DANS UN NOUVEL ONGLET
        </a>
      </div>

      <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-h-[600px]">
        <iframe 
          src="http://localhost:8001/api-docs" 
          className="w-full h-full border-0"
          title="Swagger UI"
        />
      </div>
    </div>
  );
};

export default ApiDocs;
