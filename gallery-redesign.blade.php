<!DOCTYPE html>
<html lang="en">
<head>
@include('admin.head')
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css">
<script src="https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/popper.js/1.16.0/umd/popper.min.js"></script>
<script src="https://maxcdn.bootstrapcdn.com/bootstrap/4.5.2/js/bootstrap.min.js"></script>

<style>
body{font-family:Arial,Helvetica,sans-serif;background:#f5f7fb}
.page-header-left h3{font-weight:700}
.gallery-toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:25px}
.count-badge{background:#fff;padding:10px 18px;border-radius:30px;box-shadow:0 3px 12px rgba(0,0,0,.08);font-weight:600}
.gallery-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:24px}
.gallery-card{background:#fff;border-radius:16px;overflow:hidden;position:relative;box-shadow:0 6px 18px rgba(0,0,0,.08);transition:.3s}
.gallery-card:hover{transform:translateY(-8px);box-shadow:0 15px 35px rgba(0,0,0,.18)}
.img-wrap{height:220px;overflow:hidden;background:#eee}
.img-wrap img{width:100%;height:100%;object-fit:cover;cursor:pointer;transition:.4s}
.gallery-card:hover img{transform:scale(1.08)}
.card-footer-custom{padding:14px 18px;display:flex;justify-content:space-between;align-items:center}
.delete-gal{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#fff0f1;color:#dc3545;text-decoration:none;transition:.25s}
.delete-gal:hover{background:#dc3545;color:#fff;text-decoration:none}
.gallery-empty{text-align:center;padding:70px;color:#777}
.modal{display:none;position:fixed;z-index:9999;left:0;top:0;width:100%;height:100%;background:rgba(0,0,0,.9)}
.modal-content{display:block;margin:4% auto;max-width:900px;width:90%;border-radius:12px}
.close{position:absolute;right:30px;top:15px;color:#fff;font-size:42px;font-weight:bold;cursor:pointer}
#caption{text-align:center;color:#ddd;padding:12px}
.pagination{justify-content:center}
.pagination .page-link{border-radius:8px!important;margin:0 3px}
@media(max-width:768px){.gallery-grid{grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:15px}.img-wrap{height:170px}}
</style>
</head>
<body>

<div class="page-wrapper">
@include('admin.header')

<div class="page-body-wrapper">
@include('admin.sidebar')

<div class="page-body">

<div class="container-fluid">
<div class="page-header">
<div class="row">
<div class="col-lg-12">
<div class="page-header-left">
<h3>Pictures</h3>
</div>
</div>
</div>
</div>
</div>

<div class="container-fluid">
<div class="card border-0 shadow-sm">
<div class="card-body">

<div class="gallery-toolbar">
<div class="count-badge">
{{ $pics->total() }} Photo{{ $pics->total()==1?'':'s' }}
</div>
</div>

@if($pics->count())

<div class="gallery-grid">

@foreach($pics as $pic)

<div class="gallery-card">

<div class="img-wrap">
<img class="imagebox"
src="{{ asset($pic->img_path) }}"
alt="{{ $pic->img_name }}">
</div>

<div class="card-footer-custom">
<div>
<strong>#{{ $pic->id }}</strong><br>
<small class="text-muted">{{ $pic->img_name }}</small>
</div>

<a href="{{ url('/admin/gallery/'.$pic->id.'/delete') }}"
class="delete-gal"
onclick="return confirm('Do you really want to delete this picture?')"
title="Delete">
<i class="fa fa-trash"></i>
</a>

</div>

</div>

@endforeach

</div>

@else

<div class="gallery-empty">
<i class="fa fa-image fa-4x mb-3"></i>
<h4>No Pictures Found</h4>
<p>Upload pictures to display them here.</p>
</div>

@endif

<div class="mt-4">
{!! $pics->links('pagination::bootstrap-4') !!}
</div>

</div>
</div>
</div>

@include('admin.footer')

<div id="myModal" class="modal">
<span class="close">&times;</span>
<img class="modal-content" id="img01">
<div id="caption"></div>
</div>

</div>
</div>

<script>
$(function(){
var modal=$("#myModal");
$(".imagebox").click(function(){
$("#img01").attr("src",this.src);
$("#caption").text(this.alt);
modal.fadeIn(200);
});
$(".close,#myModal").click(function(e){
if(e.target===this){modal.fadeOut(200);}
});
});
</script>

</body>
</html>
