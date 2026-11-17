param([string]$Archivo, [string]$Salida, [string]$Nombre = "Base curva con canto fino", [int]$Ns = 240, [double]$DMax = 30, [double]$Paso = 0.25)
# Saca el "acabado" de la cara de abajo de una plantilla de referencia (STL sólido, pie izquierdo, talón en Y mínima,
# lado interno en X máxima). Recorre el contorno y, en cada punto, mide hacia adentro la proporción
# lambda = altura de abajo / altura de arriba. Solo se guarda esa proporción, con la distancia al borde como
# fracción del ancho de la plantilla: ninguna medida absoluta pasa al programa.
# s = posición en el contorno: 0 punta del talón, sube por el lado externo hasta la punta de los dedos (~0,5)
# y vuelve por el lado interno.
Add-Type -TypeDefinition @"
using System; using System.IO; using System.Text; using System.Globalization; using System.Collections.Generic;
public static class Acabado {
  public static string Extraer(string ruta, string salida, string nombre, int ns, double dMax, double pasoD) {
    var b=File.ReadAllBytes(ruta); uint n=BitConverter.ToUInt32(b,80); var v=new float[n*9];
    for (long t=0;t<n;t++) for (int k=0;k<9;k++) v[t*9+k]=BitConverter.ToSingle(b,(int)(84+50*t+12+4*k));
    double[] mn={1e9,1e9,1e9}, mx={-1e9,-1e9,-1e9};
    for (int i=0;i<v.Length;i+=3) for (int k=0;k<3;k++){ if(v[i+k]<mn[k])mn[k]=v[i+k]; if(v[i+k]>mx[k])mx[k]=v[i+k]; }
    double paso=0.25; int gx=(int)((mx[0]-mn[0])/paso)+2, gy=(int)((mx[1]-mn[1])/paso)+2;
    var zt=new double[gx,gy]; var zb=new double[gx,gy];
    for (int i=0;i<gx;i++) for (int j=0;j<gy;j++){ zt[i,j]=double.NaN; zb[i,j]=double.NaN; }
    for (int t=0;t<v.Length;t+=9){
      double x0=v[t],y0=v[t+1],z0=v[t+2], x1=v[t+3],y1=v[t+4],z1=v[t+5], x2=v[t+6],y2=v[t+7],z2=v[t+8];
      double d=(y1-y2)*(x0-x2)+(x2-x1)*(y0-y2); if (Math.Abs(d)<1e-12) continue;
      int i0=(int)Math.Floor((Math.Min(x0,Math.Min(x1,x2))-mn[0])/paso), i1=(int)Math.Ceiling((Math.Max(x0,Math.Max(x1,x2))-mn[0])/paso);
      int j0=(int)Math.Floor((Math.Min(y0,Math.Min(y1,y2))-mn[1])/paso), j1=(int)Math.Ceiling((Math.Max(y0,Math.Max(y1,y2))-mn[1])/paso);
      for (int i=Math.Max(0,i0);i<=Math.Min(gx-1,i1);i++) for (int j=Math.Max(0,j0);j<=Math.Min(gy-1,j1);j++){
        double px=mn[0]+(i+0.5)*paso, py=mn[1]+(j+0.5)*paso;
        double w0=((y1-y2)*(px-x2)+(x2-x1)*(py-y2))/d, w1=((y2-y0)*(px-x2)+(x0-x2)*(py-y2))/d, w2=1-w0-w1;
        if (w0<-1e-9||w1<-1e-9||w2<-1e-9) continue; double pz=w0*z0+w1*z1+w2*z2;
        if (double.IsNaN(zt[i,j])||pz>zt[i,j]) zt[i,j]=pz; if (double.IsNaN(zb[i,j])||pz<zb[i,j]) zb[i,j]=pz; } }
    // bordes por fila, suavizados (media de 9 filas) para que las normales no sigan los escalones de la grilla
    var xl=new List<double>(); var xr=new List<double>(); var yy=new List<double>(); double ancho=0;
    for (int j=0;j<gy;j++){ int ia=-1, ib=-1; for (int i=0;i<gx;i++) if(!double.IsNaN(zt[i,j])){ if(ia<0) ia=i; ib=i; }
      if (ia<0 || ib-ia<2) continue; xl.Add(mn[0]+(ia+0.5)*paso); xr.Add(mn[0]+(ib+0.5)*paso); yy.Add(mn[1]+(j+0.5)*paso); ancho=Math.Max(ancho,(ib-ia)*paso); }
    int m=yy.Count; var sl=new double[m]; var sr=new double[m];
    for (int q=0;q<m;q++){ double a=0,c=0; int k=0; for (int r=Math.Max(0,q-4);r<=Math.Min(m-1,q+4);r++){ a+=xl[r]; c+=xr[r]; k++; } sl[q]=a/k; sr[q]=c/k; }
    // contorno: punta del talón, lado externo hacia los dedos, punta de los dedos, lado interno de vuelta
    var px_=new List<double>(); var py_=new List<double>();
    px_.Add((sl[0]+sr[0])/2); py_.Add(yy[0]-paso);
    for (int q=0;q<m;q++){ px_.Add(sl[q]); py_.Add(yy[q]); }
    px_.Add((sl[m-1]+sr[m-1])/2); py_.Add(yy[m-1]+paso);
    for (int q=m-1;q>=0;q--){ px_.Add(sr[q]); py_.Add(yy[q]); }
    int np=px_.Count; var sAcum=new double[np+1]; for (int q=1;q<=np;q++){ int a=q-1, c=q%np; sAcum[q]=sAcum[q-1]+Math.Sqrt(Math.Pow(px_[c]-px_[a],2)+Math.Pow(py_[c]-py_[a],2)); }
    double per=sAcum[np]; int nd=(int)Math.Round(dMax/pasoD)+1; var lam=new double[ns,nd];
    Func<double,double,double[]> muestra = (x,y) => { int i=(int)Math.Floor((x-mn[0])/paso), j=(int)Math.Floor((y-mn[1])/paso);
      if (i<0||j<0||i>=gx||j>=gy||double.IsNaN(zt[i,j])) return null; return new double[]{zt[i,j]-mn[2], zb[i,j]-mn[2]}; };
    for (int a=0;a<ns;a++){
      double s=per*a/ns; int q=0; while (q<np-1 && sAcum[q+1]<s) q++;
      int q0=q, q1=(q+1)%np; double f=(s-sAcum[q0])/Math.Max(1e-9,sAcum[q0+1]-sAcum[q0]);
      double ex=px_[q0]+f*(px_[q1]-px_[q0]), ey=py_[q0]+f*(py_[q1]-py_[q0]);
      // tangente con vecinos a unos 3 mm para una normal estable
      int qa=(q0-6+np)%np, qb=(q1+6)%np; double tx=px_[qb]-px_[qa], ty=py_[qb]-py_[qa], tl=Math.Sqrt(tx*tx+ty*ty); tx/=tl; ty/=tl;
      double nx=-ty, ny=tx; if (muestra(ex+nx*3, ey+ny*3)==null) { nx=-nx; ny=-ny; }
      double ultimo=0;
      for (int k=0;k<nd;k++){ double dd=Math.Max(0.3,k*pasoD); var tb=muestra(ex+nx*dd, ey+ny*dd);
        if (tb==null || tb[0]<0.3) { lam[a,k]=ultimo; continue; } ultimo=Math.Max(0,Math.Min(0.95,tb[1]/tb[0])); lam[a,k]=ultimo; } }
    // suavizado a lo largo del contorno (media de 5) para no copiar el ruido de la malla
    var sua=new double[ns,nd];
    for (int a=0;a<ns;a++) for (int k=0;k<nd;k++){ double s=0; for (int r=-2;r<=2;r++) s+=lam[(a+r+ns)%ns,k]; sua[a,k]=s/5; }
    var inv=CultureInfo.InvariantCulture; var sb=new StringBuilder();
    sb.Append("{\n  \"nombre\": \""+nombre+"\",\n  \"fuente\": \"STL de resina de LutraCAD (diseño delgado con cuña externa de retropié); solo proporción\",\n");
    sb.Append("  \"nota\": \"lambda = altura de abajo / altura de arriba. s = 0 punta del talón, por el lado externo hasta los dedos y de vuelta por el interno (pie izquierdo). d = distancia al borde como fracción del ancho.\",\n");
    sb.Append("  \"ns\": "+ns+",\n  \"nd\": "+nd+",\n  \"dMax\": "+(dMax/ancho).ToString("0.#####",inv)+",\n  \"lambda\": [\n");
    for (int a=0;a<ns;a++){ sb.Append("    ["); for (int k=0;k<nd;k++){ if(k>0) sb.Append(","); sb.Append(sua[a,k].ToString("0.###",inv)); } sb.Append(a<ns-1?"],\n":"]\n"); }
    sb.Append("  ]\n}\n"); File.WriteAllText(salida, sb.ToString());
    return string.Format("ancho de referencia {0:N1} mm, contorno {1:N0} mm, {2} puntos x {3} distancias", ancho, per, ns, nd);
  }
}
"@
New-Item -ItemType Directory -Force (Split-Path $Salida) | Out-Null
[Acabado]::Extraer($Archivo, $Salida, $Nombre, $Ns, $DMax, $Paso)
