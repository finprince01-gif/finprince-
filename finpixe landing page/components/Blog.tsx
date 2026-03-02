
import React from 'react';
import { ArrowRight } from 'lucide-react';

const Blog: React.FC = () => {
  const posts = [
    {
      id: 1,
      tag: "EXPLORE",
      image: "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?q=80&w=2071&auto=format&fit=crop",
      title: "Top 10 Bloggers in India: Income Insights 2026",
      excerpt: "The online world of India has transformed. To make money, blogging is good at the moment. This change made by the top bloggers in India",
      author: "MAITHILI",
      date: "NOVEMBER 23, 2025",
      avatar: "https://randomuser.me/api/portraits/women/44.jpg"
    },
    {
      id: 2,
      tag: "EXPLORE",
      image: "https://images.unsplash.com/photo-1677442136019-21780ecad995?q=80&w=2070&auto=format&fit=crop",
      title: "How AI-Powered Productivity Tools are Transforming Workflows",
      excerpt: "A Gartner study says that by 2026, 80% of businesses will use AI to make daily tasks more efficient and effective. This proves that the",
      author: "TEAM MM",
      date: "NOVEMBER 12, 2025",
      avatar: "https://randomuser.me/api/portraits/women/65.jpg"
    },
    {
      id: 3,
      tag: "EXPLORE",
      image: "https://images.unsplash.com/photo-1563986768609-322da13575f3?q=80&w=1470&auto=format&fit=crop",
      title: "The Secret To Good Cybersecurity Starts In The Real World",
      excerpt: "Reports from Statista suggest that the cybersecurity market will see an annual growth rate of 5.94% from 2025 to 2030. This tells us it's a",
      author: "MM TEAM",
      date: "NOVEMBER 12, 2025",
      avatar: "https://randomuser.me/api/portraits/men/32.jpg"
    }
  ];

  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex justify-between items-end mb-12">
          <div>
            <h2 className="text-4xl font-bold text-slate-900 mb-4">Latest Insights</h2>
            <div className="h-1 w-20 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full"></div>
          </div>
          <button className="hidden md:flex items-center gap-2 text-primary font-bold hover:text-transparent hover:bg-clip-text hover:bg-gradient-to-r hover:from-blue-600 hover:to-purple-600 transition-all text-lg group">
            View All Posts <ArrowRight size={22} className="text-primary group-hover:text-purple-600 transition-colors" />
          </button>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {posts.map((post) => (
            <div key={post.id} className="bg-white rounded-2xl shadow-soft hover:shadow-xl transition-all duration-300 border border-slate-100 overflow-hidden flex flex-col group">
              {/* Image Container */}
              <div className="relative h-64 overflow-hidden">
                <img 
                  src={post.image} 
                  alt={post.title} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                
                {/* Badge */}
                <div className="absolute top-4 left-4">
                  <span className="bg-[#A855F7] text-white text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wider shadow-md">
                    {post.tag}
                  </span>
                </div>

                {/* Overlapping Avatar */}
                <div className="absolute -bottom-6 left-6 z-10">
                   <div className="w-14 h-14 rounded-full border-4 border-white shadow-md overflow-hidden bg-white">
                     <img src={post.avatar} alt={post.author} className="w-full h-full object-cover" />
                   </div>
                </div>
                
                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </div>

              {/* Content */}
              <div className="pt-12 px-8 pb-8 flex-grow flex flex-col">
                <h3 className="text-2xl font-bold text-slate-900 mb-4 leading-tight group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-blue-600 group-hover:to-purple-600 transition-all">
                  {post.title}
                </h3>
                <p className="text-slate-500 text-lg leading-relaxed mb-6 line-clamp-3 flex-grow">
                  {post.excerpt}
                </p>

                {/* Footer */}
                <div className="border-t border-slate-100 pt-5 mt-auto">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wide">
                    <span className="text-slate-900">{post.author}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                    <span>{post.date}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-8 text-center md:hidden">
            <button className="inline-flex items-center gap-2 text-primary font-bold hover:text-purple-600 transition-colors text-lg">
            View All Posts <ArrowRight size={20} />
          </button>
        </div>
      </div>
    </section>
  );
};

export default Blog;
