param([string[]]$Archivos, [double[]]$Largos, [double]$Giro = 0, [double]$Inclinacion = 0, [double]$Zoom = 4,
      [double]$CentroY = 0.5, [double]$Ventana = 1.0, [string]$Salida, [int]$Ancho = 1500, [int]$AltoPorModelo = 520)
# Dibuja uno o varios STL con sombreado plano (como un laminador), uno debajo del otro, con la misma vista.
# -Largos: largo en mm al que se lleva cada modelo solo para verlo (0 = sin cambiar), para comparar formas de
#          distinta talla. -Giro / -Inclinacion: grados alrededor del eje vertical y del horizontal de la pantalla
#          (Inclinacion 0 = desde arriba, 180 = desde abajo, -70 = casi de lado). -CentroY / -Ventana: parte del
#          largo que se mira (0 = talón, 1 = dedos) para acercarse.
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System; using System.IO; using System.Drawing; using System.Drawing.Imaging; using System.Runtime.InteropServices;
public static class VerStl {
  public static void Dibujar(string ruta, double largoVista, double giro, double incl, double zoom, double centroY, int[] px, int W, int H, int oy) {
    var b=File.ReadAllBytes(ruta); uint n=BitConverter.ToUInt32(b,80); var v=new double[n*9];
    for (long t=0;t<n;t++) for (int k=0;k<9;k++) v[t*9+k]=BitConverter.ToSingle(b,(int)(84+50*t+12+4*k));
    double[] mn={1e9,1e9,1e9}, mx={-1e9,-1e9,-1e9};
    for (int i=0;i<v.Length;i+=3) for (int k=0;k<3;k++){ if(v[i+k]<mn[k])mn[k]=v[i+k]; if(v[i+k]>mx[k])mx[k]=v[i+k]; }
    double L=mx[1]-mn[1], e=largoVista>0?largoVista/L:1;
    double cx=(mn[0]+mx[0])/2, cy=mn[1]+centroY*L, cz=(mn[2]+mx[2])/2;
    double g=giro*Math.PI/180, a=incl*Math.PI/180, cg=Math.Cos(g), sg=Math.Sin(g), ca=Math.Cos(a), sa=Math.Sin(a);
    var zb=new double[W*H]; for (int i=0;i<zb.Length;i++) zb[i]=-1e18;
    double lx=-0.45, ly=-0.55, lz=0.70; double ll=Math.Sqrt(lx*lx+ly*ly+lz*lz); lx/=ll; ly/=ll; lz/=ll;
    var P=new double[9];
    for (int t=0;t<v.Length;t+=9){
      for (int k=0;k<3;k++){ double x=(v[t+3*k]-cx)*e, y=(v[t+3*k+1]-cy)*e, z=(v[t+3*k+2]-cz)*e;
        // el largo va horizontal en pantalla: giro alrededor de Z, luego inclinación alrededor del eje horizontal
        double x1=y*cg - x*sg, y1=y*sg + x*cg, z1=z;
        double y2=y1*ca - z1*sa, z2=y1*sa + z1*ca;
        P[3*k]=W/2.0 + x1*zoom; P[3*k+1]=oy + H/2.0 + y2*zoom; P[3*k+2]=z2; }
      double ux=P[3]-P[0], uy=P[4]-P[1], uz=P[5]-P[2], wx=P[6]-P[0], wy=P[7]-P[1], wz=P[8]-P[2];
      double nx=uy*wz-uz*wy, ny=uz*wx-ux*wz, nz=ux*wy-uy*wx, nl=Math.Sqrt(nx*nx+ny*ny+nz*nz); if (nl==0) continue; nx/=nl; ny/=nl; nz/=nl;
      // en pantalla Y crece hacia abajo, así que la cara mira a la cámara cuando nz < 0
      if (nz>=0) continue; nx=-nx; ny=-ny; nz=-nz;
      double dif=Math.Max(0, nx*lx+ny*ly+nz*lz), esp=Math.Pow(Math.Max(0, nz*0.92+ny*(-0.3)+nx*(-0.25)), 24);
      int c=(int)Math.Min(255, 38+185*dif+70*esp); int col=(255<<24)|(c<<16)|(c<<8)|c;
      int x0=(int)Math.Max(0,Math.Floor(Math.Min(P[0],Math.Min(P[3],P[6])))), x1b=(int)Math.Min(W-1,Math.Ceiling(Math.Max(P[0],Math.Max(P[3],P[6]))));
      int y0=(int)Math.Max(oy,Math.Floor(Math.Min(P[1],Math.Min(P[4],P[7])))), y1b=(int)Math.Min(oy+H-1,Math.Ceiling(Math.Max(P[1],Math.Max(P[4],P[7]))));
      double d=(P[4]-P[7])*(P[0]-P[6])+(P[6]-P[3])*(P[1]-P[7]); if (Math.Abs(d)<1e-12) continue;
      for (int yy=y0;yy<=y1b;yy++) for (int xx=x0;xx<=x1b;xx++){ double qx=xx+0.5, qy=yy+0.5;
        double w0=((P[4]-P[7])*(qx-P[6])+(P[6]-P[3])*(qy-P[7]))/d, w1=((P[7]-P[1])*(qx-P[6])+(P[0]-P[6])*(qy-P[7]))/d, w2=1-w0-w1;
        if (w0<-1e-6||w1<-1e-6||w2<-1e-6) continue; double z=w0*P[2]+w1*P[5]+w2*P[8]; int i=(yy-oy)*W+xx;
        if (z>zb[i]) { zb[i]=z; px[yy*W+xx]=col; } } }
  }
  public static void Guardar(string[] rutas, double[] largos, double giro, double incl, double zoom, double centroY, string salida, int W, int H) {
    int n=rutas.Length; var px=new int[W*H*n]; int fondo=(255<<24)|(24<<16)|(32<<8)|58; for (int i=0;i<px.Length;i++) px[i]=fondo;
    for (int m=0;m<n;m++) Dibujar(rutas[m], largos!=null&&m<largos.Length?largos[m]:0, giro, incl, zoom, centroY, px, W, H, m*H);
    var bmp=new Bitmap(W,H*n,PixelFormat.Format32bppArgb); var d=bmp.LockBits(new Rectangle(0,0,W,H*n),ImageLockMode.WriteOnly,PixelFormat.Format32bppArgb);
    Marshal.Copy(px,0,d.Scan0,px.Length); bmp.UnlockBits(d);
    using (var g=Graphics.FromImage(bmp)) for (int m=0;m<n;m++) g.DrawString(Path.GetFileNameWithoutExtension(rutas[m]), new Font("Arial",13), Brushes.Yellow, 8, m*H+6);
    bmp.Save(salida); bmp.Dispose();
  }
}
"@
[VerStl]::Guardar($Archivos, $Largos, $Giro, $Inclinacion, $Zoom, $CentroY, $Salida, $Ancho, $AltoPorModelo)
